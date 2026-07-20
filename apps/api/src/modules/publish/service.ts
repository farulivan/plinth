import { contentHash, type Db } from "@plinth/db";
import type { LooseContentDocument } from "@plinth/schema";
import type { FieldErrors, VersionSummary } from "@plinth/schema/api";
import { sectionTypeOf } from "@plinth/schema/content";
// The /manifest subpath is schemas only — the api validates documents but
// never renders, so the components (.tsx, React) stay out of its graph.
import { norvenSection } from "@plinth/template-norven/manifest";
import type { z } from "zod";
import { writeAuditLog } from "../../lib/auditLog";
import { emitPromoted, enqueuePublish, runSiteBuild, uploadSiteDir } from "./adapter";
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

/**
 * The publish gate (ADR-0007's strict counterpart to loose saves), applied
 * per ENABLED section: a disabled section renders nothing, so a half-typed
 * one must not block the publish — it stays in the snapshot, skipped by the
 * renderer, resumable later. This is also the escape hatch while the editor
 * cannot delete sections: toggling one off is how you park it.
 *
 * Field errors are keyed "<sectionType>.<fieldPath>" (not array indexes) so
 * the message names what the user sees in the editor.
 */
function validateForPublish(
  sectionSchemas: Record<string, z.ZodType>,
  draft: LooseContentDocument,
): FieldErrors | null {
  const errors: FieldErrors = {};
  const enabled = draft.sections.filter((section) => section.enabled);
  if (enabled.length === 0) {
    return { document: ["Enable at least one section before publishing."] };
  }
  for (const section of enabled) {
    const schema = sectionSchemas[section.type];
    if (!schema) {
      errors[section.type] = ["This section is not part of the template."];
      continue;
    }
    const parsed = schema.safeParse(section);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = [section.type, ...issue.path.filter((part) => part !== "fields")].join(".");
        (errors[path] ??= []).push(issue.message);
      }
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

/** Snapshot → static site on disk. Throwing here (bad snapshot, astro
 * failure, timeout) is the retryable path — Inngest re-runs the step. */
export async function buildVersion(
  db: Db,
  input: { workspaceId: string; versionId: string },
): Promise<{ outDir: string }> {
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
  return runSiteBuild({ versionId: input.versionId, templateId: meta.templateId, snapshot });
}

export async function uploadVersion(input: {
  workspaceId: string;
  versionNumber: number;
  outDir: string;
}): Promise<{ files: number }> {
  return uploadSiteDir({
    workspaceId: input.workspaceId,
    versionNumber: input.versionNumber,
    dir: input.outDir,
  });
}

/** Success epilogue: mark built, then swap the live pointer. */
export async function promoteVersion(db: Db, workspaceId: string, versionId: string) {
  await setVersionStatus(db, workspaceId, versionId, "built");
  await promoteWorkspaceVersion(db, workspaceId, versionId);
}
