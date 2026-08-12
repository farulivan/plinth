import type { Db } from "@plinth/db";
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
  variantWidths: [400, 800],
  createdAt: new Date("2026-07-20T00:00:00Z"),
  ...over,
});

describe("uploadMedia", () => {
  it("records the upload for a new image", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(null);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 800,
      height: 600,
      widths: [400, 800],
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
      expect.objectContaining({ variantWidths: [400, 800] }),
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

  // A legacy row narrower than the widths that were added has everything the
  // current rule would produce. Reading its null column as "no variants" would
  // re-encode it into byte-identical objects on every re-upload.
  it("reuses a pre-recording row whose original is too small for the new widths", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(row({ variantWidths: null }));

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
      widths: [1366, 1920],
      variants: [],
    });

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("refreshed");
    // Only the missing two are encoded — the legacy four already exist.
    expect(adapter.processImage).toHaveBeenCalledWith(bytes, [1366, 1920]);
    expect(dbFns.updateMediaWidths).toHaveBeenCalledWith(
      db,
      WORKSPACE,
      MEDIA_ID,
      [400, 800, 1200, 1366, 1600, 1920],
    );
    if (result.outcome === "refreshed") {
      expect(result.item.widths).toEqual([400, 800, 1200, 1366, 1600, 1920]);
    }
  });

  it("reports no widths for a row that has none, rather than an empty list", async () => {
    // `variantWidthsFor` reads absence as the legacy set; an empty array would
    // render a picture element with no sources at all.
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(row({ variantWidths: null }));

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
      row({ width: 6240, height: 3510, variantWidths: [400, 800, 1200, 1600] }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: [1366, 1920],
      variants: [],
    });

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 1, skipped: 0 });
    expect(adapter.processImage).toHaveBeenCalledWith(bytes, [1366, 1920]);
    expect(dbFns.updateMediaWidths).toHaveBeenCalledWith(
      db,
      WORKSPACE,
      MEDIA_ID,
      [400, 800, 1200, 1366, 1600, 1920],
    );
  });

  // Uploads from before originals were retained have nothing to decode. They
  // are counted, not retried and not failed — their references already claim
  // the legacy set, which is exactly what exists.
  it("skips a row whose original was never retained", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: null }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(null);

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 0, skipped: 1 });
    expect(adapter.processImage).not.toHaveBeenCalled();
    expect(dbFns.updateMediaWidths).not.toHaveBeenCalled();
  });

  it("does nothing on a library that is already current", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ width: 6240, height: 3510, variantWidths: [400, 800, 1200, 1366, 1600, 1920] }),
      row({ width: 500, variantWidths: [400] }),
    ]);

    expect(await reencodeMediaVariants(db)).toEqual({ widened: 0, skipped: 0 });
    expect(adapter.getMediaOriginal).not.toHaveBeenCalled();
  });

  it("stops at the batch limit so one run cannot hold a step open", async () => {
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([
      row({ id: "a", width: 6240, variantWidths: null }),
      row({ id: "b", width: 6240, variantWidths: null }),
      row({ id: "c", width: 6240, variantWidths: null }),
    ]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: [1366, 1920],
      variants: [],
    });

    expect(await reencodeMediaVariants(db, 2)).toEqual({ widened: 2, skipped: 0 });
  });

  it("writes the objects before it records them", async () => {
    // A row claiming a width whose bytes are absent is the 404 the recorded-
    // widths design exists to prevent, and every reference picked afterwards
    // would carry the lie.
    const order: string[] = [];
    vi.mocked(dbFns.listMediaRows).mockResolvedValue([row({ width: 6240, variantWidths: null })]);
    vi.mocked(adapter.getMediaOriginal).mockResolvedValue(bytes);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 6240,
      height: 3510,
      widths: [1366, 1920],
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
