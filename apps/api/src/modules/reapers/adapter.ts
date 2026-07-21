import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../lib/env";
import { s3 } from "../../lib/s3";

const execFileAsync = promisify(execFile);

/**
 * External boundary of the reaper domain (ADR-0009): R2 object deletion and
 * the pg_dump subprocess. Never imports db or service.
 */

/** Deletes every object under a media variant prefix. */
export function deleteMediaPrefix(prefix: string): Promise<number> {
  return deleteR2Prefix(env.R2_BUCKET_MEDIA, prefix);
}

/** Deletes every object under a site version's prefix. */
export function deleteSitePrefix(prefix: string): Promise<number> {
  return deleteR2Prefix(env.R2_BUCKET_SITES, prefix);
}

/** Deletes every object under a prefix — one bucket, potentially many keys
 * (media variants, or a whole site version's files). S3's delete-many API
 * caps at 1000 keys per call, so this pages through both list and delete. */
async function deleteR2Prefix(bucket: string, prefix: string): Promise<number> {
  let deleted = 0;
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? []).flatMap((object) =>
      object.Key ? [{ Key: object.Key }] : [],
    );
    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
      deleted += keys.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return deleted;
}

/**
 * `pg_dump --format=custom` to a temp file, then upload to R2 (ADR-0011).
 * Shells out rather than a JS dump library — pg_dump's custom format is the
 * one Postgres itself can restore with `pg_restore`, which is the property
 * that matters for a disaster-recovery artifact.
 *
 * Caveat documented, not solved here: DATABASE_URL is the same
 * transaction-mode pooler connection the app uses (ADR-0011). pg_dump works
 * fine against it for a database this size; a direct (non-pooled) connection
 * string is the fix if dump duration or lock behavior ever becomes an issue.
 */
export async function dumpDatabaseToR2(isoWeek: string): Promise<{ bytes: number; key: string }> {
  const workdir = await mkdtemp(join(tmpdir(), "plinth-backup-"));
  const dumpPath = join(workdir, "postgres.dump");
  try {
    await execFileAsync("pg_dump", [env.DATABASE_URL, "--format=custom", "--file", dumpPath]);
    const bytes = await readFile(dumpPath);
    const key = `postgres/${isoWeek}.dump`;
    await s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_BACKUPS,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
      }),
    );
    return { bytes: bytes.byteLength, key };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
