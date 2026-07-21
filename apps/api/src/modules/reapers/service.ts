import type { Db } from "@plinth/db";
import { deleteMediaPrefix, deleteSitePrefix, dumpDatabaseToR2 } from "./adapter";
import {
  deleteExpiredSessions,
  deleteMediaRows,
  deleteVersionRows,
  findAllVersions,
  findMediaRows,
  getCurrentVersionId,
  getReferenceSources,
  listWorkspaceIds,
} from "./db";

/**
 * Business logic for the reaper domain (ADR-0003/0005/0006/0011): scheduled
 * cleanup and backup, invoked by Inngest cron functions. Each reaper is
 * independent — a failure in one must not block the others, so the caller
 * (the Inngest function) runs them as separate steps, not this module.
 */

const MEDIA_ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const VERSION_RETENTION_COUNT = 10;

export async function reapExpiredSessions(db: Db): Promise<{ deleted: number }> {
  return { deleted: await deleteExpiredSessions(db) };
}

/** A media row is referenced if its id shows up anywhere in the workspace's
 * draft or any retained version snapshot — regex over the serialized JSON
 * rather than a schema-aware walk, since "mediaId" is the one key every
 * template's mediaRef shape uses (packages/schema/src/content/mediaRef.ts)
 * and this reaper has no reason to know a template's section shapes. */
function extractReferencedMediaIds(sources: unknown[]): Set<string> {
  const ids = new Set<string>();
  const pattern = /"mediaId":"([0-9a-f-]{36})"/g;
  for (const source of sources) {
    const json = JSON.stringify(source);
    for (const match of json.matchAll(pattern)) {
      ids.add(match[1]!);
    }
  }
  return ids;
}

export async function reapOrphanedMedia(db: Db): Promise<{ deleted: number }> {
  let deleted = 0;
  const cutoff = Date.now() - MEDIA_ORPHAN_GRACE_MS;

  for (const workspaceId of await listWorkspaceIds(db)) {
    const [rows, sources] = await Promise.all([
      findMediaRows(db, workspaceId),
      getReferenceSources(db, workspaceId),
    ]);
    const referenced = extractReferencedMediaIds(sources);
    const orphans = rows.filter(
      (row) => !referenced.has(row.id) && row.createdAt.getTime() < cutoff,
    );
    if (orphans.length === 0) continue;

    for (const orphan of orphans) {
      await deleteMediaPrefix(`tenants/${workspaceId}/${orphan.contentHash}/`);
    }
    await deleteMediaRows(
      db,
      workspaceId,
      orphans.map((row) => row.id),
    );
    deleted += orphans.length;
  }
  return { deleted };
}

export async function reapOldVersions(db: Db): Promise<{ deleted: number }> {
  let deleted = 0;

  for (const workspaceId of await listWorkspaceIds(db)) {
    const [versions, currentVersionId] = await Promise.all([
      findAllVersions(db, workspaceId),
      getCurrentVersionId(db, workspaceId),
    ]);
    const keep = new Set(versions.slice(0, VERSION_RETENTION_COUNT).map((v) => v.id));
    if (currentVersionId) keep.add(currentVersionId);

    const toDelete = versions.filter((v) => !keep.has(v.id));
    if (toDelete.length === 0) continue;

    for (const version of toDelete) {
      await deleteSitePrefix(`tenants/${workspaceId}/v${version.versionNumber}/`);
    }
    await deleteVersionRows(
      db,
      workspaceId,
      toDelete.map((v) => v.id),
    );
    deleted += toDelete.length;
  }
  return { deleted };
}

/** ISO 8601 week ("2026-W29") for the weekly dump's R2 key (ADR-0011). */
export function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function backupDatabase(): Promise<{ bytes: number; key: string }> {
  return dumpDatabaseToR2(isoWeek(new Date()));
}
