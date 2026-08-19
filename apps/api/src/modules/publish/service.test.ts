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
// hostnameFor reads TENANT_HOST_SUFFIX from the env contract at import time,
// same reason adapter is mocked above.
vi.mock("../domains/service", () => ({
  hostnameFor: (slug: string) => `${slug}.example.test`,
}));

const db = {} as Db;
const WORKSPACE = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000002";
const VERSION = "00000000-0000-0000-0000-000000000003";

/** A v2 document holding one home page. Sections vary per test; site settings
 * are filled because the publish gate now asks for them (ADR-0015). */
const docWith = (sections: unknown[], pageOverrides = {}): LooseContentDocumentV2 =>
  ({
    schemaVersion: 2,
    site: {
      name: "Norven",
      description: "An architecture practice",
      nav: [],
      social: [],
      footerLinks: [],
      locations: [],
    },
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

const media = {
  mediaId: "00000000-0000-4000-8000-0000000000aa",
  alt: "Salt House",
  contentHash: "a".repeat(64),
  width: 2400,
  height: 1350,
};

/** Every required field of a Norven project — the baseline a test subtracts
 * from when it wants to prove the gate catches something. */
const completeProject = {
  title: "Salt House",
  year: 2023,
  kind: "Residence",
  status: "Built",
  location: "Tjøme, Norway",
  area: "280 m²",
  brief: "A coastal residence cut into a granite shelf.",
  cover: media,
  body: ["First paragraph."],
  gallery: [],
};

const entry = (slug: string, fields: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000000${slug.length.toString().padStart(2, "0")}`,
  slug,
  enabled: true,
  seo: { noindex: false },
  fields,
});

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
    slug: "norven",
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
    draft.site = {
      name: "",
      description: "",
      nav: [],
      social: [],
      footerLinks: [],
      locations: [],
    };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["site"]).toEqual([
      "Set the site name and description before publishing.",
    ]);
  });

  // A nav entry pointing nowhere is a link that 404s on every page of the
  // site, and it is invisible until someone clicks it.
  it("refuses a nav link no enabled page produces", async () => {
    const draft = docWith([validSection]);
    draft.site.nav = [{ label: "Studio", href: "/studio/" }];
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["site.nav.0"]?.[0]).toContain("/studio/");
  });

  it("accepts a nav link to a page that exists, and leaves external links alone", async () => {
    const draft = docWith([validSection]);
    draft.pages.push({
      id: "00000000-0000-4000-8000-000000000001",
      path: "/studio/",
      enabled: true,
      seo: { noindex: false },
      sections: [validSection],
    } as (typeof draft.pages)[number]);
    draft.site.nav = [
      { label: "Studio", href: "/studio/" },
      { label: "Instagram", href: "https://example.com/norven" },
    ];
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  // A disabled page emits no route, so a nav link to one is as broken as a
  // link to a page that was never written.
  it("refuses a nav link to a disabled page", async () => {
    const draft = docWith([validSection]);
    draft.pages.push({
      id: "00000000-0000-4000-8000-000000000001",
      path: "/studio/",
      enabled: false,
      seo: { noindex: false },
      sections: [validSection],
    } as (typeof draft.pages)[number]);
    draft.site.nav = [{ label: "Studio", href: "/studio/" }];
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
  });

  it("refuses a collection the template does not declare", async () => {
    const draft = docWith([validSection]);
    draft.collections = { journal: { pathTemplate: "/journal/{slug}/", entries: [] } };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["journal"]).toEqual(["This collection is not part of the template."]);
  });

  it("validates an enabled entry's fields against the template's entry schema", async () => {
    const draft = docWith([validSection]);
    draft.collections = {
      projects: {
        pathTemplate: "/projects/{slug}/",
        entries: [entry("salt-house", { title: "Salt House" })],
      },
    };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    // Keyed by collection and slug, which is what the editor shows.
    expect(
      Object.keys(result.fieldErrors).some((key) => key.startsWith("projects.salt-house.")),
    ).toBe(true);
  });

  // The escape hatch that makes strict publishing survivable: one unfinished
  // project must not refuse to publish the entire site (ADR-0015).
  it("skips a parked entry, however unfinished", async () => {
    const draft = docWith([validSection]);
    draft.collections = {
      projects: {
        pathTemplate: "/projects/{slug}/",
        entries: [{ ...entry("draft-project", {}), enabled: false }],
      },
    };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  // Nothing downstream reports this. The build emits both routes and the
  // second upload wins in R2, so the loser reads as a page that simply did
  // not publish — and a slug is exactly the field most likely to collide.
  it("refuses an entry whose path a page already publishes", async () => {
    const draft = docWith([validSection]);
    draft.pages.push({
      id: "00000000-0000-4000-8000-000000000001",
      path: "/projects/salt-house/",
      enabled: true,
      seo: { noindex: false },
      sections: [validSection],
    } as (typeof draft.pages)[number]);
    draft.collections = {
      projects: {
        pathTemplate: "/projects/{slug}/",
        entries: [entry("salt-house", completeProject)],
      },
    };
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["projects.salt-house"]?.[0]).toContain("/projects/salt-house/");
  });

  // A form with no delivery key posts into nowhere and looks identical to one
  // that works. The enquiry is lost silently, which is the worst shape this
  // failure could take, so it is the one the gate exists for.
  it("refuses a contact form with no delivery key", async () => {
    const draft = docWith([
      validSection,
      {
        type: "contactForm",
        enabled: true,
        fields: {
          heading: "Tell us what you are building.",
          fallbackEmail: "studio@norven.example",
          projectTypes: [{ label: "Residence" }],
          submitLabel: "Send",
          successMessage: "Thank you.",
        },
      },
    ]);
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);

    const result = await requestPublish(db, { workspaceId: WORKSPACE, userId: USER });

    expect(result.outcome).toBe("invalid-draft");
    if (result.outcome !== "invalid-draft") return;
    expect(result.fieldErrors["site.contactFormKey"]?.[0]).toContain("submissions would be lost");
  });

  it("accepts the same form once the key is set", async () => {
    const draft = docWith([
      validSection,
      {
        type: "contactForm",
        enabled: true,
        fields: {
          heading: "Tell us what you are building.",
          fallbackEmail: "studio@norven.example",
          projectTypes: [{ label: "Residence" }],
          submitLabel: "Send",
          successMessage: "Thank you.",
        },
      },
    ]);
    draft.site.contactFormKey = "11111111-2222-3333-4444-555555555555";
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  // A parked form renders nothing, so it cannot lose anything either.
  it("ignores a parked form with no key", async () => {
    const draft = docWith([validSection, { type: "contactForm", enabled: false, fields: {} }]);
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  it("accepts a nav link to a path a collection entry produces", async () => {
    const draft = docWith([validSection]);
    draft.collections = {
      projects: {
        pathTemplate: "/projects/{slug}/",
        entries: [entry("salt-house", completeProject)],
      },
    };
    draft.site.nav = [{ label: "Salt House", href: "/projects/salt-house/" }];
    vi.mocked(dbFns.getDraftDocument).mockResolvedValue(draft);
    vi.mocked(dbFns.findVersionByIdempotencyKey).mockResolvedValue(null);
    vi.mocked(dbFns.createVersion).mockResolvedValue(versionRow("queued"));

    expect((await requestPublish(db, { workspaceId: WORKSPACE, userId: USER })).outcome).toBe(
      "created",
    );
  });

  // The failure this guards is silent: without an origin the build still
  // succeeds and publishes, just with no canonical, no absolute Open Graph
  // URL and no sitemap — a site that looks fine and is invisible to crawlers.
  it("passes the tenant's own origin to the build", async () => {
    vi.mocked(dbFns.getVersionSnapshot).mockResolvedValue(validDraft);
    vi.mocked(adapter.runSiteBuild).mockResolvedValue({ outDir: "/tmp/out", workDir: "/tmp/work" });
    vi.mocked(adapter.uploadSiteDir).mockResolvedValue({ files: 1 });

    await buildAndUploadVersion(db, {
      workspaceId: WORKSPACE,
      versionId: VERSION,
      versionNumber: 4,
    });

    expect(adapter.runSiteBuild).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: "https://norven.example.test" }),
    );
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
      slug: "norven",
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
