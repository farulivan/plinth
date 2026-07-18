import { withWorkspace, type Db } from "@plinth/db";
import { media } from "@plinth/db/schema";
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
  createdAt: Date;
}

const mediaColumns = {
  id: media.id,
  contentHash: media.contentHash,
  width: media.width,
  height: media.height,
  fileSize: media.fileSize,
  contentType: media.contentType,
  createdAt: media.createdAt,
};

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
