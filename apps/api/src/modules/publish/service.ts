import { contentHash, type Db } from "@plinth/db";
import type { LooseContentDocumentV2 } from "@plinth/schema";
import type { FieldErrors, VersionSummary } from "@plinth/schema/api";
import { sectionTypeOf } from "@plinth/schema/content";
// The /manifest subpath is schemas only — the api validates documents but
// never renders, so the components (.tsx, React) stay out of its graph.
import { norvenSection } from "@plinth/template-norven/manifest";
import type { z } from "zod";
import { writeAuditLog } from "../../lib/auditLog";
import {
  emitPromoted,
  enqueuePublish,
  removeBuildDir,
  runSiteBuild,
  uploadSiteDir,
} from "./adapter";
import {
  createVersion,
  findVersionByIdempotencyKey,
  getDraftDocument,
  getVersion,
  getVersionSnapshot,
  getWorkspaceMeta,
  latestVersion,
  listVersions,
  promoteWorkspaceVersion,
  setVersionStatus,
  type VersionRow,
} from "./db";

/**
 * Business logic for the publish domain (ADR-0003). Plain functions — the
 * routes call the request-side ones with a session-derived workspace id, the
 * Inngest build function calls the build-side ones with its event payload.
 *
 * Publish is two write events: requestPublish validates the CURRENT draft
 * against the template schema (strict — the gate ADR-0007's loose saves
 * defer to), snapshots it immutably, and enqueues; the build steps then run
 * out of band. The idempotency key IS the content hash, so re-publishing
 * unchanged content returns the existing version instead of rebuilding.
 */

/** The api-side template registry: publish must not trust the dashboard's
 * validation (signed ≠ correct), so the strict section schemas live on both
 * sides. One entry per template package, same as the dashboard's registry. */
const templateSections: Record<string, Record<string, z.ZodType>> = {
  "template-norven": Object.fromEntries(
    norvenSection.options.map((section) => [sectionTypeOf(section), section]),
  ),
};

/** Entry schemas per collection name. Empty until a template declares one —
 * present now so an unrecognised collection is rejected rather than published
 * unvalidated, which is the direction a mistake would go otherwise. */
const collectionEntries: Record<string, z.ZodType> = {};

/**
 * The publish gate (ADR-0007's strict counterpart to loose saves), applied per
 * ENABLED page, section and collection entry. Everything disabled renders
 * nothing, so a half-typed one must not block the publish — it stays in the
 * snapshot, skipped by the renderer, resumable later. That escape hatch now
 * matters more than it did: without `enabled` on pages and entries, one
 * unfinished project would refuse to publish an entire site (ADR-0015).
 *
 * Error keys name what the user sees in the editor: "<path>.<section>.<field>"
 * for a page, "<collection>.<slug>.<field>" for an entry. Array indexes are
 * dropped for the same reason they always were — "items.2.title" locates a
 * field, "items" names one.
 */
function validateForPublish(
  sectionSchemas: Record<string, z.ZodType>,
  draft: LooseContentDocumentV2,
): FieldErrors | null {
  const errors: FieldErrors = {};

  const collect = (prefix: string, schema: z.ZodType, value: unknown): void => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      const path = [prefix, ...issue.path.filter((part) => part !== "fields")].join(".");
      (errors[path] ??= []).push(issue.message);
    }
  };

  if (!draft.site.name || !draft.site.description) {
    // Seeded blank by the v1 upgrade rather than invented (ADR-0015), so this
    // is the prompt a migrated workspace sees exactly once.
    errors["site"] = ["Set the site name and description before publishing."];
  }

  const pages = draft.pages.filter((page) => page.enabled);
  if (pages.length === 0) {
    return { document: ["Enable at least one page before publishing."] };
  }

  for (const page of pages) {
    const enabled = page.sections.filter((section) => section.enabled);
    if (enabled.length === 0) {
      errors[page.path] = ["Enable at least one section on this page."];
      continue;
    }
    for (const section of enabled) {
      const schema = sectionSchemas[section.type];
      if (!schema) {
        errors[`${page.path}.${section.type}`] = ["This section is not part of the template."];
        continue;
      }
      collect(`${page.path}.${section.type}`, schema, section);
    }
  }

  for (const [name, collection] of Object.entries(draft.collections)) {
    const entrySchema = collectionEntries[name];
    if (!entrySchema) {
      errors[name] = ["This collection is not part of the template."];
      continue;
    }
    for (const entry of collection.entries.filter((candidate) => candidate.enabled)) {
      collect(`${name}.${entry.slug}`, entrySchema, entry.fields);
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

export type PublishRequestResult =
  | { outcome: "created" | "reused"; version: VersionSummary }
  | { outcome: "no-draft" }
  | { outcome: "unknown-template"; templateId: string }
  | { outcome: "invalid-draft"; fieldErrors: FieldErrors };

export type RetryResult =
  | { outcome: "requeued"; version: VersionSummary }
  | { outcome: "not-found" }
  | { outcome: "not-failed"; status: VersionSummary["status"] };

function toSummary(row: VersionRow): VersionSummary {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    status: row.status,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function requestPublish(
  db: Db,
  input: { workspaceId: string; userId: string },
): Promise<PublishRequestResult> {
  const meta = await getWorkspaceMeta(db, input.workspaceId);
  if (!meta) return { outcome: "no-draft" };
  const sectionSchemas = templateSections[meta.templateId];
  if (!sectionSchemas) return { outcome: "unknown-template", templateId: meta.templateId };

  const draft = await getDraftDocument(db, input.workspaceId);
  if (!draft) return { outcome: "no-draft" };

  const fieldErrors = validateForPublish(sectionSchemas, draft);
  if (fieldErrors) return { outcome: "invalid-draft", fieldErrors };

  // Hash the stored draft document (not the strict parse output) so this key
  // equals the preview's hash for the same content.
  const hash = contentHash(draft);
  const existing = await findVersionByIdempotencyKey(db, input.workspaceId, hash);
  if (existing) {
    await writeAuditLog(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      action: "publish.requested",
      payload: { versionId: existing.id, versionNumber: existing.versionNumber, outcome: "reused" },
    });
    return { outcome: "reused", version: toSummary(existing) };
  }

  const version = await createVersion(db, input.workspaceId, {
    snapshot: draft,
    contentHash: hash,
    idempotencyKey: hash,
    createdBy: input.userId,
  });

  try {
    await enqueuePublish({
      workspaceId: input.workspaceId,
      versionId: version.id,
      versionNumber: version.versionNumber,
    });
  } catch (error) {
    // The snapshot exists but no job will build it — surface that honestly
    // instead of a version stuck on "queued". Retry re-enqueues it.
    await setVersionStatus(db, input.workspaceId, version.id, "failed");
    throw error;
  }

  await writeAuditLog(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: "publish.requested",
    payload: { versionId: version.id, versionNumber: version.versionNumber, outcome: "created" },
  });

  return { outcome: "created", version: toSummary(version) };
}

export async function getPublishStatus(
  db: Db,
  workspaceId: string,
): Promise<{ currentVersionId: string | null; latest: VersionSummary | null }> {
  const [meta, latest] = await Promise.all([
    getWorkspaceMeta(db, workspaceId),
    latestVersion(db, workspaceId),
  ]);
  return {
    currentVersionId: meta?.currentVersionId ?? null,
    latest: latest ? toSummary(latest) : null,
  };
}

export async function getVersionHistory(
  db: Db,
  workspaceId: string,
): Promise<{ currentVersionId: string | null; versions: VersionSummary[] }> {
  const [meta, rows] = await Promise.all([
    getWorkspaceMeta(db, workspaceId),
    listVersions(db, workspaceId),
  ]);
  return {
    currentVersionId: meta?.currentVersionId ?? null,
    versions: rows.map(toSummary),
  };
}

export type RollbackResult =
  | { outcome: "rolled-back"; version: VersionSummary }
  | { outcome: "not-found" }
  | { outcome: "not-built"; status: VersionSummary["status"] };

/** Rollback IS the promote mechanism pointed backwards (ADR-0003): one row
 * update plus the same KV-sync event. Only built versions qualify — their R2
 * artifacts exist by construction. */
export async function rollbackToVersion(
  db: Db,
  input: { workspaceId: string; versionId: string; userId: string },
): Promise<RollbackResult> {
  const version = await getVersion(db, input.workspaceId, input.versionId);
  if (!version) return { outcome: "not-found" };
  if (version.status !== "built") return { outcome: "not-built", status: version.status };

  await promoteWorkspaceVersion(db, input.workspaceId, input.versionId);
  await emitPromoted({
    workspaceId: input.workspaceId,
    versionId: version.id,
    versionNumber: version.versionNumber,
  });
  await writeAuditLog(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.userId,
    action: "publish.rolled_back",
    payload: { versionId: version.id, versionNumber: version.versionNumber },
  });
  return { outcome: "rolled-back", version: toSummary(version) };
}

export async function retryPublish(
  db: Db,
  input: { workspaceId: string; versionId: string },
): Promise<RetryResult> {
  const version = await getVersion(db, input.workspaceId, input.versionId);
  if (!version) return { outcome: "not-found" };
  if (version.status !== "failed") return { outcome: "not-failed", status: version.status };

  const requeued = await setVersionStatus(db, input.workspaceId, input.versionId, "queued");
  await enqueuePublish({
    workspaceId: input.workspaceId,
    versionId: version.id,
    versionNumber: version.versionNumber,
  });
  return { outcome: "requeued", version: toSummary(requeued!) };
}

// --- build side (called from the Inngest function, ADR-0003) ---

/** A version that can never build (workspace or snapshot gone) — retrying is
 * pointless, so the job converts this to a non-retriable failure. */
export class UnbuildableVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnbuildableVersionError";
  }
}

export async function markVersionBuilding(db: Db, workspaceId: string, versionId: string) {
  await setVersionStatus(db, workspaceId, versionId, "building");
}

export async function markVersionFailed(db: Db, workspaceId: string, versionId: string) {
  await setVersionStatus(db, workspaceId, versionId, "failed");
}

/**
 * Snapshot → static site on disk → R2, as one unit. Throwing here (bad
 * snapshot, astro failure, timeout, upload error) is the retryable path —
 * Inngest re-runs the step.
 *
 * Building and uploading are deliberately *not* separate steps. Every
 * `step.run` is its own HTTP invocation of the job: the step's return value is
 * persisted as JSON and replayed on the next one. A filesystem path survives
 * that round trip as a string but not as a directory — it only still resolves
 * if the following invocation happens to reach the same machine with the same
 * tmpdir intact. With `min_machines_running = 0` and `auto_stop_machines =
 * "suspend"` (apps/api/fly.toml) that is not a property this service has: a
 * machine may suspend between steps, and a second may pick up the next one.
 *
 * Retrying could not have rescued it either, which is the part that made the
 * split worth undoing. Inngest replays *successful* steps from their stored
 * result rather than re-running them, so a retry would have re-fed the same
 * dead path to the upload: `readdir` raises ENOENT, all three attempts fail
 * identically, and the publish lands in `failed` with a build that actually
 * worked. The tenant's only recovery is to press Retry and start a fresh run.
 * In the narrower case where the directory survives but its contents do not,
 * `readdir` returns zero entries instead of throwing and the job promotes an
 * empty R2 prefix with every step green — rarer, and worse.
 *
 * The price is retry granularity: a failed upload now re-runs the build too.
 * A wasted `astro build` is cheaper than either outcome.
 */
export async function buildAndUploadVersion(
  db: Db,
  input: { workspaceId: string; versionId: string; versionNumber: number },
): Promise<{ files: number }> {
  const [meta, snapshot] = await Promise.all([
    getWorkspaceMeta(db, input.workspaceId),
    getVersionSnapshot(db, input.workspaceId, input.versionId),
  ]);
  if (!meta) throw new UnbuildableVersionError(`Workspace ${input.workspaceId} no longer exists.`);
  if (!snapshot) {
    throw new UnbuildableVersionError(
      `Version ${input.versionId} has no snapshot in this workspace.`,
    );
  }

  const { outDir, workDir } = await runSiteBuild({
    versionId: input.versionId,
    templateId: meta.templateId,
    snapshot,
  });
  try {
    return await uploadSiteDir({
      workspaceId: input.workspaceId,
      versionNumber: input.versionNumber,
      dir: outDir,
    });
  } finally {
    // Runs on the retry path too, where it matters most: without it every
    // failed attempt would leave another dist/ behind.
    await removeBuildDir(workDir);
  }
}

/** Success epilogue: mark built, then swap the live pointer. */
export async function promoteVersion(db: Db, workspaceId: string, versionId: string) {
  await setVersionStatus(db, workspaceId, versionId, "built");
  await promoteWorkspaceVersion(db, workspaceId, versionId);
}
