import { contentHash, type Db } from "@plinth/db";
import type { LooseContentDocumentV2, SectionInstance } from "@plinth/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditLog from "../../lib/auditLog";
import * as adapter from "./adapter";
import * as dbFns from "./db";
import {
  buildAndUploadVersion,
  requestPublish,
  retryPublish,
  rollbackToVersion,
  UnbuildableVersionError,
} from "./service";

// Factory mocks (not automock) so the real modules never evaluate — adapter
// constructs an S3 client from the env contract at import time.
vi.mock("./adapter", () => ({
  enqueuePublish: vi.fn(),
  emitPromoted: vi.fn(),
  runSiteBuild: vi.fn(),
  uploadSiteDir: vi.fn(),
  removeBuildDir: vi.fn(),
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

/** A v2 document holding one home page. Sections vary per test; site settings
 * are filled because the publish gate now asks for them (ADR-0015). */
const docWith = (sections: unknown[], pageOverrides = {}): LooseContentDocumentV2 =>
  ({
    schemaVersion: 2,
    site: { name: "Norven", description: "An architecture practice", nav: [], social: [] },
    pages: [
      {
        id: "00000000-0000-4000-8000-000000000000",
        path: "/",
        enabled: true,
        seo: { noindex: false },
        sections: sections as SectionInstance[],
        ...pageOverrides,
      },
    ],
    collections: {},
  }) as LooseContentDocumentV2;

const validSection = {
  type: "statement",
  enabled: true,
  fields: { eyebrow: "The practice", body: "A finished body." },
};
const validDraft = docWith([validSection]);

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
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(
      docWith([{ type: "statement", enabled: true, fields: { eyebrow: "", body: "x" } }]),
    );

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(Object.keys(result.fieldErrors)).toContain("/.statement.eyebrow");
    expect(dbFns.createVersion).not.toHaveBeenCalled();
  });

  it("ignores disabled sections — a half-finished hidden section cannot block publish", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(
      docWith([
        { type: "photoHero", enabled: false, fields: { title: "" } }, // no photo yet
        validSection,
      ]),
    );
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("created");
  });

  it("refuses a document with no enabled sections", async () => {
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(
      docWith([{ type: "statement", enabled: false, fields: { eyebrow: "x", body: "y" } }]),
    );

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["/"]).toEqual(["Enable at least one section on this page."]);
  });

  // Without `enabled` on a page, one unfinished page would refuse to publish
  // every finished one alongside it (ADR-0015).
  it("ignores a disabled page, so an unfinished one cannot block the site", async () => {
    const draft = docWith([validSection]);
    draft.pages.push({
      id: "00000000-0000-4000-8000-000000000001",
      path: "/studio/",
      enabled: false,
      seo: { noindex: false },
      sections: [{ type: "statement", enabled: true, fields: { eyebrow: "", body: "" } }],
    } as (typeof draft.pages)[number]);
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  it("keys errors by page path, so the same section type on two pages is distinguishable", async () => {
    const draft = docWith([
      { type: "statement", enabled: true, fields: { eyebrow: "", body: "x" } },
    ]);
    draft.pages.push({
      id: "00000000-0000-4000-8000-000000000001",
      path: "/studio/",
      enabled: true,
      seo: { noindex: false },
      sections: [{ type: "statement", enabled: true, fields: { eyebrow: "", body: "y" } }],
    } as (typeof draft.pages)[number]);
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(Object.keys(result.fieldErrors)).toEqual(
      expect.arrayContaining(["/.statement.eyebrow", "/studio/.statement.eyebrow"]),
    );
  });

  // The v1 upgrade seeds these blank rather than inventing them, so a migrated
  // workspace is asked once instead of publishing a title nobody chose.
  it("asks for site settings the v1 upgrade could not supply", async () => {
    const draft = docWith([validSection]);
    draft.site = { name: "", description: "", nav: [], social: [] };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["site"]).toEqual([
      "Set the site name and description before publishing.",
    ]);
  });

  it("refuses a collection the template does not declare", async () => {
    const draft = docWith([validSection]);
    draft.collections = { projects: { pathTemplate: "/projects/{slug}/", entries: [] } };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["projects"]).toEqual([
      "This collection is not part of the template.",
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

describe("buildAndUploadVersion", () => {
  const built = { outDir: "/tmp/plinth-build-x/dist", workDir: "/tmp/plinth-build-x" };

  beforeEach(() => {
    vi.mocked(dbFns.getWorkspaceMeta).mockResolvedValue({
      templateId: "template-norven",
      currentVersionId: null,
    });
    vi.mocked(dbFns.getVersionSnapshot).mockResolvedValue(validDraft as never);
    vi.mocked(adapter.runSiteBuild).mockResolvedValue(built);
    vi.mocked(adapter.uploadSiteDir).mockResolvedValue({ files: 12 });
  });

  it("uploads the directory the build produced and reports its file count", async () => {
    const result = await buildAndUploadVersion(db, {
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 7,
    });

    expect(result).toEqual({ files: 12 });
    expect(adapter.uploadSiteDir).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      versionNumber: 7,
      dir: built.outDir,
    });
  });

  it("removes the build tree after a successful upload", async () => {
    await buildAndUploadVersion(db, {
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 7,
    });

    expect(adapter.removeBuildDir).toHaveBeenCalledWith(built.workDir);
  });

  // The retry path is where a leak compounds: without cleanup here every
  // failed attempt would strand another dist/ on the machine.
  it("removes the build tree even when the upload throws", async () => {
    vi.mocked(adapter.uploadSiteDir).mockRejectedValue(new Error("R2 unreachable"));

    await expect(
      buildAndUploadVersion(db, {
        workspaceId: WORKSPACE,
        versionId: VERSION,
        versionNumber: 7,
      }),
    ).rejects.toThrow("R2 unreachable");

    expect(adapter.removeBuildDir).toHaveBeenCalledWith(built.workDir);
  });

  it("refuses to build a version whose snapshot is gone, without touching disk", async () => {
    vi.mocked(dbFns.getVersionSnapshot).mockResolvedValue(null as never);

    await expect(
      buildAndUploadVersion(db, {
        workspaceId: WORKSPACE,
        versionId: VERSION,
        versionNumber: 7,
      }),
    ).rejects.toBeInstanceOf(UnbuildableVersionError);

    expect(adapter.runSiteBuild).not.toHaveBeenCalled();
    expect(adapter.uploadSiteDir).not.toHaveBeenCalled();
  });
});
