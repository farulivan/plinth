import { hashBody } from "@plinth/internal-rpc";
import type { Db } from "@plinth/db";
import {
  legacyVariantWidths,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_STORAGE_CAP_BYTES,
  mediaVariantWidths,
  type MediaItem,
} from "@plinth/schema/api";
import { writeAuditLog } from "../../lib/auditLog";
import {
  getMediaObject,
  getMediaOriginal,
  processImage,
  uploadMediaOriginal,
  uploadMediaVariants,
} from "./adapter";
import {
  findMediaByHash,
  insertMedia,
  listMediaRows,
  listWorkspaceIds,
  storageUsedBytes,
  updateMediaWidths,
  type MediaRow,
} from "./db";
import { sniffImageType } from "./sniff";

/**
 * Business logic for the media domain (ADR-0006). Upload is synchronous from
 * the editor's perspective: validate bytes → dedupe on (workspace, sha256) →
 * Sharp variants → R2 → row.
 */

export type UploadResult =
  | { outcome: "created" | "reused" | "refreshed"; item: MediaItem }
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
    // Null becomes absent rather than an empty array: `variantWidthsFor` reads
    // absence as "the legacy set", and `[]` would render no srcset at all.
    ...(row.variantWidths && row.variantWidths.length > 0 ? { widths: row.variantWidths } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * What is on disk for a row. A null column is not "nothing" — it is the frozen
 * legacy set, the same reading `variantWidthsFor` gives a reference. Treating
 * null as empty would make every pre-recording image look incomplete, and the
 * ones narrower than 1366 would be re-encoded to produce byte-identical
 * objects they already had.
 */
function existingWidths(row: MediaRow): number[] {
  return row.variantWidths ?? legacyVariantWidths(row.width);
}

/** Widths this original should have under today's rule, minus what it has. */
function missingWidths(row: MediaRow): number[] {
  const have = new Set(existingWidths(row));
  return mediaVariantWidths(row.width).filter((width) => !have.has(width));
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
    // Dedupe stops short of a re-encode only while the existing variants are
    // still the full current set. When they are not — the image predates a
    // width — re-uploading the file is the author's remedy, and it has to
    // actually do something: the picker rewrites the reference from the
    // returned item, so this is the one path that widens both the objects in
    // R2 and the reference pointing at them.
    const missing = missingWidths(existing);
    if (missing.length === 0) {
      await writeAuditLog(db, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "media.uploaded",
        payload: { mediaId: existing.id, contentHash, outcome: "reused" },
      });
      return { outcome: "reused", item: toItem(existing) };
    }

    // Retain the original too. The bytes are in hand and this row is one that
    // did not have them — a re-upload that widened the variants but kept the
    // image un-re-encodable would leave it needing another manual re-upload
    // the next time a width is added, which is the toil this is meant to end.
    // A no-op cost when the original was already stored: same key, same bytes.
    const [refreshed] = await Promise.all([
      widenVariants(db, input.workspaceId, existing, input.bytes, missing),
      uploadMediaOriginal(input.workspaceId, contentHash, contentType, input.bytes),
    ]);
    await writeAuditLog(db, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "media.uploaded",
      payload: { mediaId: existing.id, contentHash, outcome: "refreshed", widths: refreshed },
    });
    return { outcome: "refreshed", item: toItem({ ...existing, variantWidths: refreshed }) };
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
  // The original rides along under the same prefix, so the reaper's existing
  // prefix delete sweeps it with everything else.
  await Promise.all([
    uploadMediaVariants(input.workspaceId, contentHash, processed.variants),
    uploadMediaOriginal(input.workspaceId, contentHash, contentType, input.bytes),
  ]);

  try {
    const row = await insertMedia(db, input.workspaceId, {
      contentHash,
      width: processed.width,
      height: processed.height,
      fileSize: input.bytes.byteLength,
      contentType,
      variantWidths: processed.widths,
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

/**
 * Encode `missing` from the original bytes, write them, then record the wider
 * set. Objects before row, for the same reason upload does it in that order:
 * a row advertising a width whose bytes are absent is the 404 the recorded-
 * widths design exists to prevent, and it would be baked into every reference
 * picked afterwards.
 *
 * Widths already present are not re-encoded. Sharp is deterministic, so those
 * objects would be byte-identical — pure cost, and on a 6000px original the
 * difference is seconds.
 */
async function widenVariants(
  db: Db,
  workspaceId: string,
  row: MediaRow,
  bytes: Buffer,
  missing: number[],
): Promise<number[]> {
  const processed = await processImage(bytes, missing);
  await uploadMediaVariants(workspaceId, row.contentHash, processed.variants);

  const widths = [...new Set([...existingWidths(row), ...processed.widths])].sort((a, b) => a - b);
  await updateMediaWidths(db, workspaceId, row.id, widths);
  return widths;
}

/**
 * Fill in variants for media that predates a width (ADR-0006).
 *
 * Nothing to do the day a width is added for uploads made after originals
 * began being retained — but the widths a reference carries are frozen at pick
 * time, so this converges the *objects*, not the references. An author sees
 * the wider set on a page after re-picking the image; re-uploading the file
 * does both at once (see `uploadMedia`).
 *
 * A null `variantWidths` is not a candidate and never becomes one. Width
 * recording and original retention shipped together, so a null column means
 * exactly "no original was kept" — there is nothing to decode, forever. Ruling
 * those out from the column rather than from a failed R2 read is what keeps
 * this cheap: otherwise every legacy image in every workspace would cost one
 * missing-object lookup a night, in perpetuity, to reach the same answer.
 *
 * `skipped` therefore counts a genuine anomaly — a row claiming widths whose
 * original has gone missing — rather than a permanent background population.
 *
 * Bounded per run so a library that has fallen far behind converges over
 * several nights instead of holding one Inngest step open for an hour.
 */
const REENCODE_BATCH = 25;

export async function reencodeMediaVariants(
  db: Db,
  limit = REENCODE_BATCH,
): Promise<{ widened: number; skipped: number }> {
  let widened = 0;
  let skipped = 0;

  for (const workspaceId of await listWorkspaceIds(db)) {
    if (widened >= limit) break;

    for (const row of await listMediaRows(db, workspaceId)) {
      if (widened >= limit) break;
      if (row.variantWidths === null) continue;
      const missing = missingWidths(row);
      if (missing.length === 0) continue;

      const original = await getMediaOriginal(workspaceId, row.contentHash, row.contentType);
      if (!original) {
        skipped += 1;
        continue;
      }

      await widenVariants(db, workspaceId, row, original, missing);
      widened += 1;
    }
  }
  return { widened, skipped };
}

/** One stored variant for the dashboard's preview proxy (ADR-0014). */
export async function getMediaFile(
  workspaceId: string,
  contentHash: string,
  variantFile: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  return getMediaObject(workspaceId, contentHash, variantFile);
}
