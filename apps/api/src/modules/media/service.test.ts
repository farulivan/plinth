import type { Db } from "@plinth/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditLog from "../../lib/auditLog";
import * as adapter from "./adapter";
import * as dbFns from "./db";
import { uploadMedia } from "./service";
import * as sniff from "./sniff";

// Factory mocks so the real modules never evaluate — adapter constructs an
// S3 client from the env contract at import time, same reasoning as the
// publish domain's service.test.ts.
vi.mock("./adapter", () => ({
  processImage: vi.fn(),
  uploadMediaVariants: vi.fn(),
  getMediaObject: vi.fn(),
}));
vi.mock("./db", () => ({
  listMediaRows: vi.fn(),
  findMediaByHash: vi.fn(),
  storageUsedBytes: vi.fn(),
  insertMedia: vi.fn(),
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

describe("uploadMedia", () => {
  it("records the upload for a new image", async () => {
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue(null);
    vi.mocked(adapter.processImage).mockResolvedValue({
      width: 800,
      height: 600,
      variants: [],
    });
    vi.mocked(dbFns.insertMedia).mockResolvedValue({
      id: MEDIA_ID,
      contentHash: "hash",
      width: 800,
      height: 600,
      fileSize: bytes.byteLength,
      contentType: "image/jpeg",
      createdAt: new Date("2026-07-20T00:00:00Z"),
    });

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("created");
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
    vi.mocked(dbFns.findMediaByHash).mockResolvedValue({
      id: MEDIA_ID,
      contentHash: "hash",
      width: 800,
      height: 600,
      fileSize: bytes.byteLength,
      contentType: "image/jpeg",
      createdAt: new Date("2026-07-20T00:00:00Z"),
    });

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

  it("does not record an audit entry for a rejected upload", async () => {
    vi.mocked(sniff.sniffImageType).mockReturnValue(null);

    const result = await uploadMedia(db, { workspaceId: WORKSPACE, bytes, actorUserId: USER });

    expect(result.outcome).toBe("unsupported-type");
    expect(auditLog.writeAuditLog).not.toHaveBeenCalled();
  });
});
