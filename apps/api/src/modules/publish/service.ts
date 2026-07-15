import { contentHash, type Db } from "@plinth/db";
import type { FieldErrors, VersionSummary } from "@plinth/schema/api";
// The /manifest subpath is schemas only — the api validates documents but
// never renders, so the components (.tsx, React) stay out of its graph.
import { norvenDocument } from "@plinth/template-norven/manifest";
import type { z } from "zod";
import { enqueuePublish, runSiteBuild, uploadSiteDir } from "./adapter";
import {
  createVersion,
  findVersionByIdempotencyKey,
  getDraftDocument,
  getVersion,
  getVersionSnapshot,
  getWorkspaceMeta,
  latestVersion,
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
 * validation (signed ≠ correct), so the strict document schema lives on both
 * sides. One entry per template package, same as the dashboard's registry. */
const templateDocuments: Record<string, z.ZodType> = {
  "template-norven": norvenDocument,
};

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

function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "document";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export async function requestPublish(
  db: Db,
  input: { workspaceId: string; userId: string },
): Promise<PublishRequestResult> {
  const meta = await getWorkspaceMeta(db, input.workspaceId);
  if (!meta) return { outcome: "no-draft" };
  const schema = templateDocuments[meta.templateId];
  if (!schema) return { outcome: "unknown-template", templateId: meta.templateId };

  const draft = await getDraftDocument(db, input.workspaceId);
  if (!draft) return { outcome: "no-draft" };

  const strict = schema.safeParse(draft);
  if (!strict.success)
    return { outcome: "invalid-draft", fieldErrors: toFieldErrors(strict.error) };

  // Hash the stored draft document (not the strict parse output) so this key
  // equals the preview's hash for the same content.
  const hash = contentHash(draft);
  const existing = await findVersionByIdempotencyKey(db, input.workspaceId, hash);
  if (existing) return { outcome: "reused", version: toSummary(existing) };

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
  if (!meta) throw new Error(`Workspace ${input.workspaceId} no longer exists.`);
  if (!snapshot) throw new Error(`Version ${input.versionId} has no snapshot in this workspace.`);
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
