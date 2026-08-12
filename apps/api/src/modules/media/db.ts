import { withWorkspace, type Db } from "@plinth/db";
import { media, workspaces } from "@plinth/db/schema";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Data access for the media domain (ADR-0009): the only media layer that
 * talks to Postgres. Every query rides withWorkspace, so RLS scopes it —
 * including the storage-cap sum, which therefore can never include another
 * tenant's bytes (ADR-0006).
 */

export interface MediaRow {
  id: string;
  contentHash: string;
  width: number;
  height: number;
  fileSize: number;
  contentType: string;
  /** Null on rows written before widths were recorded — the legacy set. */
  variantWidths: number[] | null;
  createdAt: Date;
}

const mediaColumns = {
  id: media.id,
  contentHash: media.contentHash,
  width: media.width,
  height: media.height,
  fileSize: media.fileSize,
  contentType: media.contentType,
  variantWidths: media.variantWidths,
  createdAt: media.createdAt,
};

/** Every workspace id, for the re-encoder's per-tenant loop. Mirrors the
 * reapers' own copy rather than importing it: ADR-0009 keeps a module's db
 * access inside the module, and `workspaces` is the one un-RLS'd table a
 * background job may read without a GUC set (ADR-0002). */
export async function listWorkspaceIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  return rows.map((row) => row.id);
}

export async function listMediaRows(db: Db, workspaceId: string): Promise<MediaRow[]> {
  return withWorkspace(db, workspaceId, (tx) =>
    tx.select(mediaColumns).from(media).orderBy(desc(media.createdAt)),
  );
}

export async function findMediaByHash(
  db: Db,
  workspaceId: string,
  contentHash: string,
): Promise<MediaRow | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx.select(mediaColumns).from(media).where(eq(media.contentHash, contentHash)),
  );
  return row ?? null;
}

export async function storageUsedBytes(db: Db, workspaceId: string): Promise<number> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx.select({ used: sql<number>`coalesce(sum(${media.fileSize}), 0)` }).from(media),
  );
  return Number(row?.used ?? 0);
}

export async function insertMedia(
  db: Db,
  workspaceId: string,
  input: {
    contentHash: string;
    width: number;
    height: number;
    fileSize: number;
    contentType: string;
    variantWidths: number[];
  },
): Promise<MediaRow> {
  const [created] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .insert(media)
      .values({ workspaceId, ...input })
      .returning(mediaColumns),
  );
  return created!;
}

/** Records what a re-encode produced. Written after the objects land, never
 * before: a row claiming widths whose bytes are missing is exactly the 404
 * this whole mechanism exists to avoid. */
export async function updateMediaWidths(
  db: Db,
  workspaceId: string,
  mediaId: string,
  variantWidths: number[],
): Promise<void> {
  await withWorkspace(db, workspaceId, (tx) =>
    tx.update(media).set({ variantWidths }).where(eq(media.id, mediaId)),
  );
}
