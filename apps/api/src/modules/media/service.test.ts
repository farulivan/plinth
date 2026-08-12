import type { Db } from "@plinth/db";
import { legacyVariantWidths, mediaVariantWidths } from "@plinth/schema/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditLog from "../../lib/auditLog";
import * as adapter from "./adapter";
import * as dbFns from "./db";
import { reencodeMediaVariants, uploadMedia } from "./service";
import * as sniff from "./sniff";

// Factory mocks so the real modules never evaluate — adapter constructs an
// S3 client from the env contract at import time, same reasoning as the
// publish domain's service.test.ts.
vi.mock("./adapter", () => ({
  processImage: vi.fn(),
  uploadMediaVariants: vi.fn(),
  uploadMediaOriginal: vi.fn(),
  getMediaOriginal: vi.fn(),
  getMediaObject: vi.fn(),
}));
vi.mock("./db", () => ({
  listMediaRows: vi.fn(),
  listWorkspaceIds: vi.fn(),
  findMediaByHash: vi.fn(),
  storageUsedBytes: vi.fn(),
  insertMedia: vi.fn(),
  updateMediaWidths: vi.fn(),
}));
vi.mock("./sniff", () => ({ sniffImageType: vi.fn() }));
vi.mock("../../lib/auditLog", () => ({ writeAuditLog: vi.fn() }));

const db = {} as Db;
const WORKSPACE = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const MEDIA_ID = "00000000-0000-0000-0000-000000000003";
const bytes = Buffer.from("fake-image-bytes");

// Derived, not spelled out. These assertions are about the RULE — what a
// fresh upload makes, and what an old row is still missing — so a width
// added to the ladder must not read as a broken test.
const CURRENT_SMALL = mediaVariantWidths(800);
const CURRENT_LARGE = mediaVariantWidths(6240);
const LEGACY_LARGE = legacyVariantWidths(6240);
const MISSING_FROM_LEGACY = CURRENT_LARGE.filter((w) => !LEGACY_LARGE.includes(w));
/** An original small enough that the legacy ladder and the current one
 * produce the same set for it — the case where null truly means complete. */
const SMALL_ORIGINAL = 500;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sniff.sniffImageType).mockReturnValue("image/jpeg");
  vi.mocked(dbFns.storageUsedBytes).mockResolvedValue(0);
});

/** A stored row; `variantWidths` null means it predates the recording. */
const row = (over: Partial<dbFns.MediaRow> = {}): dbFns.MediaRow => ({
  id: MEDIA_ID,
  contentHash: "hash",
  width: 800,
  height: 600,
  fileSize: bytes.byteLength,
  contentType: "image/jpeg",
  variantWidths: CURRENT_SMALL,
  createdAt: new Date("2026-07-20T00:00:00Z"),
  ...over,
});

describe("uploadMedia", () => {
  it("records the upload for a new image", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(null);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 800,
      height: 600,
      widths: CURRENT_SMALL,
      variants: [],
    });
    vi.mocked(dbFns.insertMedia).mockResolvedValue(row());

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("created");
    // Without the original there is nothing to encode a future width from.
    expect(adapter.uploadMediaOriginal).toHaveBeenCalledWith(
      WORKSPACE,
      expect.any(String),
      "image/jpeg",
      bytes,
    );
    expect(dbFns.insertMedia).toHaveBeenCalledWith(
      db,
      WORKSPACE,
      expect.objectContaining({ variantWidths: CURRENT_SMALL }),
    );
    expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId: WORKSPACE,
        actorUserId: USER,
        action: "media.uploaded",
        payload: expect.objectContaining({ mediaId: MEDIA_ID, outcome: "created" }),
      }),
    );
  });

  it("records a reused upload without touching storage", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(row());

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("reused");
    expect(adapter.processImage).not.toHaveBeenCalled();
    expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "media.uploaded",
        payload: expect.objectContaining({ outcome: "reused" }),
      }),
    );
  });

  // A legacy row narrower than every width that was added since already has
  // what the current rule would produce. Reading its null column as "no
  // variants" would re-encode it into byte-identical objects on re-upload.
  //
  // SMALL_ORIGINAL is chosen so the legacy ladder and the current one agree
  // for it — spelling a width here would make this test a liability the next
  // time one is added, which is exactly what happened when 640 landed.
  it("reuses a pre-recording row whose original is too small for the new widths", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(
      row({ width: SMALL_ORIGINAL, variantWidths: null }),
    );

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("reused");
    expect(adapter.processImage).not.toHaveBeenCalled();
  });

  // The remedy for media that predates a width: re-uploading the file widens
  // the objects, and the picker rewrites the reference from what comes back.
  it("widens a stale image on re-upload instead of short-circuiting", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(
      row({ width: 6240, height: 3510, variantWidths: null }),
    );
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: MISSING_FROM_LEGACY,
      variants: [],
    });

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("refreshed");
    // Only the widths added since the legacy set are encoded.
    expect(adapter.processImage).toHaveBeenCalledWith(bytes, MISSING_FROM_LEGACY);
    // And the original is kept, so the next width needs no second re-upload.
    expect(adapter.uploadMediaOriginal).toHaveBeenCalledWith(
      WORKSPACE,
      expect.any(String),
      "image/jpeg",
      bytes,
    );
    expect(dbFns.updateMediaWidths).toHaveBeenCalledWith(db, WORKSPACE, MEDIA_ID, CURRENT_LARGE);
    if (result.outcome === "refreshed") {
      expect(result.item.widths).toEqual(CURRENT_LARGE);
    }
  });

  it("reports no widths for a row that has none, rather than an empty list", async () => {
    // `variantWidthsFor` reads absence as the legacy set; an empty array would
    // render a picture element with no sources at all.
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(
      row({ width: SMALL_ORIGINAL, variantWidths: null }),
    );

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("reused");
    if (result.outcome === "reused") expect(result.item.widths).toBeUndefined();
  });

  it("does not record an audit entry for a rejected upload", async () => {
    vi.mocked(sniff.sniffImageType).mockReturnValue(null);

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("unsupported-type");
    expect(auditLog.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("reencodeMediaVariants", () => {
  beforeEach(() => {
    vi.mocked(dbFns.listWorkspaceIds).mockResolvedValue([WORKSPACE]);
  });

  it("encodes only the widths an image is missing", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: LEGACY_LARGE }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: MISSING_FROM_LEGACY,
      variants: [],
    });

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 1, skipped: 0 });
    expect(adapter.processImage).toHaveBeenCalledWith(bytes, MISSING_FROM_LEGACY);
    expect(dbFns.updateMediaWidths).toHaveBeenCalledWith(db, WORKSPACE, MEDIA_ID, CURRENT_LARGE);
  });

  // Width recording and original retention shipped together, so a null column
  // means no original exists — knowable without asking R2. Reaching for the
  // object anyway would cost one missing-object lookup per legacy image per
  // night, in perpetuity, to reach an answer the column already gave.
  it("never reaches for an original a null column already rules out", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: null }),
    ]);

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 0, skipped: 0 });
    expect(adapter.getMediaOriginal).not.toHaveBeenCalled();
    expect(dbFns.updateMediaWidths).not.toHaveBeenCalled();
  });

  // Distinct from the case above: this row claims a width set, so its original
  // is supposed to be there. Counted, so the anomaly is visible in the run
  // result rather than silently doing nothing.
  it("counts a row whose recorded original has gone missing", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: LEGACY_LARGE }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(null);

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 0, skipped: 1 });
    expect(adapter.processImage).not.toHaveBeenCalled();
  });

  it("does nothing on a library that is already current", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: CURRENT_LARGE }),
      row({ width: 500, variantWidths: mediaVariantWidths(500) }),
    ]);

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 0, skipped: 0 });
    expect(adapter.getMediaOriginal).not.toHaveBeenCalled();
  });

  it("stops at the batch limit so one run cannot hold a step open", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ id: "a", width: 6240, variantWidths: LEGACY_LARGE }),
      row({ id: "b", width: 6240, variantWidths: LEGACY_LARGE }),
      row({ id: "c", width: 6240, variantWidths: LEGACY_LARGE }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: MISSING_FROM_LEGACY,
      variants: [],
    });

    expect(await reencodeMediaVariants(db, 2)).toEqual({ widened: 2, skipped: 0 });
  });

  it("writes the objects before it records them", async () => {
    // A row claiming a width whose bytes are absent is the 404 the recorded-
    // widths design exists to prevent, and every reference picked afterwards
    // would carry the lie.
    const order: string[] = [];
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, variantWidths: LEGACY_LARGE }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: MISSING_FROM_LEGACY,
      variants: [],
    });
    vi.mocked(adapter.uploadMediaVariants).mockImplementation(async () => {
      order.push("objects");
    });
    vi.mocked(dbFns.updateMediaWidths).mockImplementation(async () => {
      order.push("row");
    });

    await reencodeMediaVariants(db);

    expect(order).toEqual(["objects", "row"]);
  });
});
