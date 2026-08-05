import { withWorkspace, type Db } from "@plinth/db";
import { contentDrafts, contentVersions, workspaces } from "@plinth/db/schema";
import { parseContentDocument, type LooseContentDocumentV2 } from "@plinth/schema";
import type { VersionStatus } from "@plinth/schema/api";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Data access for the publish domain (ADR-0009): the only publish layer that
 * touches Postgres. Every content_versions read/write rides withWorkspace so
 * RLS scopes it (ADR-0002) — including the Inngest job, which passes the
 * workspace id from its event payload instead of a session. The `workspaces`
 * table is deliberately un-RLS'd (it is the GUC target); its two touchpoints
 * here read a template id and swap the version pointer for an id the caller
 * already proved membership on.
 */

export interface VersionRow {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  contentHash: string;
  createdAt: Date;
}

const versionColumns = {
  id: contentVersions.id,
  versionNumber: contentVersions.versionNumber,
  status: contentVersions.status,
  contentHash: contentVersions.contentHash,
  createdAt: contentVersions.createdAt,
};

export async function getWorkspaceMeta(
  db: Db,
  workspaceId: string,
): Promise<{ slug: string; templateId: string; currentVersionId: string | null } | null> {
  const [row] = await db
    .select({
      slug: workspaces.slug,
      templateId: workspaces.templateId,
      currentVersionId: workspaces.currentVersionId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row ?? null;
}

/** Upgrades on read (ADR-0015). Every consumer sees the current shape, and —
 * because the hash the publish gate stores must equal the one the preview
 * channel emits — both sides have to hash the same side of the upgrade. */
export async function getDraftDocument(
  db: Db,
  workspaceId: string,
): Promise<LooseContentDocumentV2 | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({ document: contentDrafts.document })
      .from(contentDrafts)
      .where(eq(contentDrafts.workspaceId, workspaceId)),
  );
  return row ? parseContentDocument(row.document) : null;
}

export async function findVersionByIdempotencyKey(
  db: Db,
  workspaceId: string,
  idempotencyKey: string,
): Promise<VersionRow | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select(versionColumns)
      .from(contentVersions)
      .where(eq(contentVersions.idempotencyKey, idempotencyKey)),
  );
  return row ?? null;
}

export async function getVersion(
  db: Db,
  workspaceId: string,
  versionId: string,
): Promise<VersionRow | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx.select(versionColumns).from(contentVersions).where(eq(contentVersions.id, versionId)),
  );
  return row ?? null;
}

/** Upgrades on read for the same reason: a rollback can select a snapshot
 * written before the pages migration, and the builder must render it without
 * a rebuild (docs/migrations.md). */
export async function getVersionSnapshot(
  db: Db,
  workspaceId: string,
  versionId: string,
): Promise<LooseContentDocumentV2 | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({ snapshot: contentVersions.snapshot })
      .from(contentVersions)
      .where(eq(contentVersions.id, versionId)),
  );
  return row ? parseContentDocument(row.snapshot) : null;
}

export async function latestVersion(db: Db, workspaceId: string): Promise<VersionRow | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select(versionColumns)
      .from(contentVersions)
      .orderBy(desc(contentVersions.versionNumber))
      .limit(1),
  );
  return row ?? null;
}

/** Newest-first history for the rollback UI — bounded to the retention
 * window's size (ADR-0003 keeps 10 per tenant). */
export async function listVersions(db: Db, workspaceId: string): Promise<VersionRow[]> {
  return withWorkspace(db, workspaceId, (tx) =>
    tx
      .select(versionColumns)
      .from(contentVersions)
      .orderBy(desc(contentVersions.versionNumber))
      .limit(10),
  );
}

/** Insert an immutable snapshot with the next monotonic version number.
 * Two racing publishes can pick the same number (max+1 in one tx each); the
 * unique index rejects the loser and we retake the max — bounded retries
 * because the race window is one insert wide. */
export async function createVersion(
  db: Db,
  workspaceId: string,
  input: {
    snapshot: LooseContentDocumentV2;
    contentHash: string;
    idempotencyKey: string;
    createdBy: string;
  },
): Promise<VersionRow> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withWorkspace(db, workspaceId, async (tx) => {
        const [row] = await tx
          .select({ next: sql<number>`coalesce(max(${contentVersions.versionNumber}), 0) + 1` })
          .from(contentVersions);
        const [created] = await tx
          .insert(contentVersions)
          .values({
            workspaceId,
            versionNumber: row!.next,
            snapshot: input.snapshot,
            contentHash: input.contentHash,
            idempotencyKey: input.idempotencyKey,
            createdBy: input.createdBy,
          })
          .returning(versionColumns);
        return created!;
      });
    } catch (error) {
      if (attempt >= 3 || !isUniqueViolation(error)) throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let cause: unknown = error; cause; cause = (cause as { cause?: unknown }).cause) {
    if ((cause as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export async function setVersionStatus(
  db: Db,
  workspaceId: string,
  versionId: string,
  status: VersionStatus,
): Promise<VersionRow | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .update(contentVersions)
      .set({ status })
      .where(eq(contentVersions.id, versionId))
      .returning(versionColumns),
  );
  return row ?? null;
}

/** The atomic pointer swap (ADR-0003): rollback and promote are both this
 * one-row update. */
export async function promoteWorkspaceVersion(
  db: Db,
  workspaceId: string,
  versionId: string,
): Promise<void> {
  await db
    .update(workspaces)
    .set({ currentVersionId: versionId })
    .where(eq(workspaces.id, workspaceId));
}
