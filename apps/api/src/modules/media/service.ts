import { hashBody } from "@plinth/internal-rpc";
import type { Db } from "@plinth/db";
import {
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_STORAGE_CAP_BYTES,
  type MediaItem,
} from "@plinth/schema/api";
import { writeAuditLog } from "../../lib/auditLog";
import { getMediaObject, processImage, uploadMediaVariants } from "./adapter";
import { findMediaByHash, insertMedia, listMediaRows, storageUsedBytes, type MediaRow } from "./db";
import { sniffImageType } from "./sniff";

/**
 * Business logic for the media domain (ADR-0006). Upload is synchronous from
 * the editor's perspective: validate bytes → dedupe on (workspace, sha256) →
 * Sharp variants → R2 → row. Re-uploading the same photo is one lookup, zero
 * storage writes.
 */

export type UploadResult =
  | { outcome: "created" | "reused"; item: MediaItem }
  | { outcome: "unsupported-type" }
  | { outcome: "unreadable-image" }
  | { outcome: "too-large" }
  | { outcome: "storage-cap"; usedBytes: number };

function toItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    contentHash: row.contentHash,
    width: row.width,
    height: row.height,
    fileSize: row.fileSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWorkspaceMedia(db: Db, workspaceId: string): Promise<MediaItem[]> {
  return (await listMediaRows(db, workspaceId)).map(toItem);
}

export async function uploadMedia(
  db: Db,
  input: { workspaceId: string; bytes: Buffer; actorUserId: string },
): Promise<UploadResult> {
  if (input.bytes.byteLength > MEDIA_MAX_UPLOAD_BYTES) return { outcome: "too-large" };

  const contentType = sniffImageType(input.bytes);
  if (!contentType) return { outcome: "unsupported-type" };

  const contentHash = hashBody(input.bytes);
  const existing = await findMediaByHash(db, input.workspaceId, contentHash);
  if (existing) {
    await writeAuditLog(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "media.uploaded",
      payload: { mediaId: existing.id, contentHash, outcome: "reused" },
    });
    return { outcome: "reused", item: toItem(existing) };
  }

  const usedBytes = await storageUsedBytes(db, input.workspaceId);
  if (usedBytes + input.bytes.byteLength > MEDIA_STORAGE_CAP_BYTES) {
    return { outcome: "storage-cap", usedBytes };
  }

  let processed;
  try {
    processed = await processImage(input.bytes);
  } catch {
    // The sniff passed but Sharp couldn't decode — truncated or corrupt file.
    return { outcome: "unreadable-image" };
  }

  // Variants first, row second: a crash between the two leaves unreferenced
  // objects (the orphan reaper's problem), never a row without its variants.
  await uploadMediaVariants(input.workspaceId, contentHash, processed.variants);

  try {
    const row = await insertMedia(db, input.workspaceId, {
      contentHash,
      width: processed.width,
      height: processed.height,
      fileSize: input.bytes.byteLength,
      contentType,
    });
    await writeAuditLog(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "media.uploaded",
      payload: { mediaId: row.id, contentHash, outcome: "created" },
    });
    return { outcome: "created", item: toItem(row) };
  } catch (error) {
    // A racing duplicate upload lost to the unique index — return the winner.
    const raced = await findMediaByHash(db, input.workspaceId, contentHash);
    if (raced) return { outcome: "reused", item: toItem(raced) };
    throw error;
  }
}

/** One stored variant for the dashboard's preview proxy (ADR-0014). */
export async function getMediaFile(
  workspaceId: string,
  contentHash: string,
  variantFile: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  return getMediaObject(workspaceId, contentHash, variantFile);
}
