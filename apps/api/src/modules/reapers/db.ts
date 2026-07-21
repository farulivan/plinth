import { withWorkspace, type Db } from "@plinth/db";
import { contentDrafts, contentVersions, media, sessions, workspaces } from "@plinth/db/schema";
import { desc, eq, inArray, lt } from "drizzle-orm";

/**
 * Data access for the reaper domain (ADR-0009): cross-tenant cleanup, so the
 * shape differs from every other db.ts — most functions loop over
 * `listWorkspaceIds` and open one `withWorkspace` transaction per tenant,
 * rather than taking a single workspace id (ADR-0002: workspaces itself is
 * the only un-RLS'd table a background job may read without a GUC set).
 */

export async function listWorkspaceIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  return rows.map((row) => row.id);
}

export async function getCurrentVersionId(db: Db, workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ currentVersionId: workspaces.currentVersionId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row?.currentVersionId ?? null;
}

/** Sessions carry no RLS (ADR-0005: scoped by user_id before tenant code
 * runs) — a plain delete, no workspace loop. */
export async function deleteExpiredSessions(db: Db): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({
    id: sessions.id,
  });
  return deleted.length;
}

export interface MediaRow {
  id: string;
  contentHash: string;
  createdAt: Date;
}

export async function findMediaRows(db: Db, workspaceId: string): Promise<MediaRow[]> {
  return withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({ id: media.id, contentHash: media.contentHash, createdAt: media.createdAt })
      .from(media),
  );
}

export async function deleteMediaRows(db: Db, workspaceId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withWorkspace(db, workspaceId, (tx) => tx.delete(media).where(inArray(media.id, ids)));
}

/** Every field that can carry a media reference, across the still-live draft
 * and every retained version snapshot — what a media row must appear in to
 * count as "referenced" rather than orphaned. */
export async function getReferenceSources(db: Db, workspaceId: string): Promise<unknown[]> {
  return withWorkspace(db, workspaceId, async (tx) => {
    const [draftRows, versionRows] = await Promise.all([
      tx.select({ document: contentDrafts.document }).from(contentDrafts),
      tx.select({ snapshot: contentVersions.snapshot }).from(contentVersions),
    ]);
    return [...draftRows.map((row) => row.document), ...versionRows.map((row) => row.snapshot)];
  });
}

export interface VersionRow {
  id: string;
  versionNumber: number;
}

/** Newest-first, unbounded — the retention cut happens in the service layer
 * so it can factor in the currently-live version. */
export async function findAllVersions(db: Db, workspaceId: string): Promise<VersionRow[]> {
  return withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({ id: contentVersions.id, versionNumber: contentVersions.versionNumber })
      .from(contentVersions)
      .orderBy(desc(contentVersions.versionNumber)),
  );
}

export async function deleteVersionRows(db: Db, workspaceId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withWorkspace(db, workspaceId, (tx) =>
    tx.delete(contentVersions).where(inArray(contentVersions.id, ids)),
  );
}
