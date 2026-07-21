import { contentHash, type Db } from "@plinth/db";
import type { LooseContentDocument } from "@plinth/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditLog from "../../lib/auditLog";
import * as adapter from "./adapter";
import * as dbFns from "./db";
import { requestPublish, retryPublish, rollbackToVersion } from "./service";

// Factory mocks (not automock) so the real modules never evaluate — adapter
// constructs an S3 client from the env contract at import time.
vi.mock("./adapter", () => ({
  enqueuePublish: vi.fn(),
  emitPromoted: vi.fn(),
  runSiteBuild: vi.fn(),
  uploadSiteDir: vi.fn(),
}));
vi.mock("./db", () => ({
  getWorkspaceMeta: vi.fn(),
  getDraftDocument: vi.fn(),
  findVersionByIdempotencyKey: vi.fn(),
  getVersion: vi.fn(),
  getVersionSnapshot: vi.fn(),
  latestVersion: vi.fn(),
  listVersions: vi.fn(),
  createVersion: vi.fn(),
  setVersionStatus: vi.fn(),
  promoteWorkspaceVersion: vi.fn(),
}));
// writeAuditLog opens its own withWorkspace transaction against the real
// pool — stub it the same way as adapter/db so tests never touch Postgres.
vi.mock("../../lib/auditLog", () => ({ writeAuditLog: vi.fn() }));

const db = {} as Db;
const WORKSPACE = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const VERSION = "00000000-0000-0000-0000-000000000003";

const validDraft = {
  schemaVersion: 1,
  sections: [
    {
      type: "statement",
      enabled: true,
      fields: { eyebrow: "The practice", body: "A finished body." },
    },
  ],
} as LooseContentDocument;

const versionRow = (status: "queued" | "building" | "built" | "failed") => ({
  id: VERSION,
  versionNumber: 4,
  status,
  contentHash: contentHash(validDraft),
  createdAt: new Date("2026-07-13T00:00:00Z"),
});

beforeEach(() => {
  // reset (not clear): implementations like the rejected enqueue must not
  // bleed between tests.
  vi.resetAllMocks();
  vi.mocked(dbFns.getWorkspaceMeta).mockResolvedValue({
    templateId: "template-norven",
    currentVersionId: null,
  });
});

describe("requestPublish", () => {
  it("rejects an enabled section that fails the strict schema, keyed by type.field", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue({
      schemaVersion: 1,
      sections: [{ type: "statement", enabled: true, fields: { eyebrow: "", body: "x" } }],
    } as LooseContentDocument);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(Object.keys(result.fieldErrors)).toContain("statement.eyebrow");
    expect(dbFns.createVersion).not.toHaveBeenCalled();
  });

  it("ignores disabled sections — a half-finished hidden section cannot block publish", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue({
      schemaVersion: 1,
      sections: [
        { type: "photoHero", enabled: false, fields: { title: "" } }, // no photo yet
        ...validDraft.sections,
      ],
    } as LooseContentDocument);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("created");
  });

  it("refuses a document with no enabled sections", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue({
      schemaVersion: 1,
      sections: [{ type: "statement", enabled: false, fields: { eyebrow: "x", body: "y" } }],
    } as LooseContentDocument);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["document"]).toEqual([
      "Enable at least one section before publishing.",
    ]);
  });

  it("reuses the existing version when the content hash matches (idempotency)", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(validDraft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(versionRow("built"));

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("reused");
    expect(dbFns.findVersionByIdempotencyKey).toHaveBeenCalledWith(
      db,
      WORKSPACE,
      contentHash(validDraft),
    );
    expect(dbFns.createVersion).not.toHaveBeenCalled();
    expect(adapter.enqueuePublish).not.toHaveBeenCalled();
  });

  it("snapshots and enqueues a new version for new content", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(validDraft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("created");
    expect(dbFns.createVersion).toHaveBeenCalledWith(db, WORKSPACE, {
      snapshot: validDraft,
      contentHash: contentHash(validDraft),
      idempotencyKey: contentHash(validDraft),
      createdBy: USER,
    });
    expect(adapter.enqueuePublish).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 4,
    });
    expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId: WORKSPACE,
        actorUserId: USER,
        action: "publish.requested",
      }),
    );
  });

  it("marks the version failed when the enqueue dies, instead of leaving it queued", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(validDraft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));
    vi.mocked(adapter.enqueuePublish).mockRejectedValue(new Error("inngest unreachable"));

    await expect(requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).rejects.toThrow(
      "inngest unreachable",
    );
    expect(dbFns.setVersionStatus).toHaveBeenCalledWith(db, WORKSPACE, VERSION, "failed");
    expect(auditLog.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("rollbackToVersion", () => {
  it("refuses versions that never built — their artifacts don't exist", async () => {
    vi.mocked(dbFns.getVersion).mockResolvedValue(versionRow("failed"));

    const result = await rollbackToVersion(db, {
      workspaceId: WORKSPACE,
      versionId: VERSION,
      userId: USER,
    });

    expect(result).toEqual({ outcome: "not-built", status: "failed" });
    expect(dbFns.promoteWorkspaceVersion).not.toHaveBeenCalled();
  });

  it("repoints the live version and announces it for KV sync", async () => {
    vi.mocked(dbFns.getVersion).mockResolvedValue(versionRow("built"));

    const result = await rollbackToVersion(db, {
      workspaceId: WORKSPACE,
      versionId: VERSION,
      userId: USER,
    });

    expect(result.outcome).toBe("rolled-back");
    expect(dbFns.promoteWorkspaceVersion).toHaveBeenCalledWith(db, WORKSPACE, VERSION);
    expect(adapter.emitPromoted).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 4,
    });
    expect(auditLog.writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId: WORKSPACE,
        actorUserId: USER,
        action: "publish.rolled_back",
      }),
    );
  });
});

describe("retryPublish", () => {
  it("requeues only failed versions", async () => {
    vi.mocked(dbFns.getVersion).mockResolvedValue(versionRow("building"));

    const result = await retryPublish(db, { workspaceId: WORKSPACE, versionId: VERSION });

    expect(result).toEqual({ outcome: "not-failed", status: "building" });
    expect(adapter.enqueuePublish).not.toHaveBeenCalled();
  });

  it("re-enqueues the same version id on retry", async () => {
    vi.mocked(dbFns.getVersion).mockResolvedValue(versionRow("failed"));
    vi.mocked(dbFns.setVersionStatus).mockResolvedValue(versionRow("queued"));

    const result = await retryPublish(db, { workspaceId: WORKSPACE, versionId: VERSION });

    expect(result.outcome).toBe("requeued");
    expect(adapter.enqueuePublish).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 4,
    });
  });
});
