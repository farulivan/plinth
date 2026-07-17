/**
 * Local bridge for the publish loop (ADR-0013 companion): production
 * converges through the KV-sync Inngest function and the real R2 bucket, but
 * `wrangler dev` simulates both bindings in .wrangler/state — this script
 * copies the current truth (the Postgres version pointer + the MinIO
 * artifacts) into that simulation.
 *
 * Run after a publish, with `wrangler dev` running or not:
 *   pnpm worker:sync
 * Then browse http://{slug}.localhost:8787/.
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createDb, withWorkspace } from "@plinth/db";
import { contentVersions, workspaces } from "@plinth/db/schema";
import { eq, isNotNull } from "drizzle-orm";

const execFileAsync = promisify(execFile);

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth";
const R2_ENDPOINT_URL = process.env.R2_ENDPOINT_URL ?? "http://localhost:9000";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "plinth";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "plinth-local-dev";
const BUCKET = process.env.R2_BUCKET_SITES ?? "plinth-sites";
const MEDIA_BUCKET = process.env.R2_BUCKET_MEDIA ?? "plinth-media";
const HOST_SUFFIX = process.env.TENANT_HOST_SUFFIX ?? ".localhost";
const WORKER_DIR = join(import.meta.dirname, "../apps/worker-router");

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT_URL,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

async function wrangler(args: string[]): Promise<void> {
  await execFileAsync("pnpm", ["exec", "wrangler", ...args], { cwd: WORKER_DIR });
}

/** Copy every object under an S3 prefix into wrangler's local R2 simulation. */
async function syncPrefix(bucket: string, prefix: string, tmp: string): Promise<number> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const keys = (listed.Contents ?? []).flatMap((entry) => (entry.Key ? [entry.Key] : []));
  for (const key of keys) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const file = join(tmp, key.split("/").join("__"));
    await writeFile(file, await object.Body!.transformToByteArray());
    await wrangler([
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      file,
      "--content-type",
      object.ContentType ?? "application/octet-stream",
      "--local",
    ]);
  }
  return keys.length;
}

async function main() {
  const { db, pool } = createDb({ connectionString: DATABASE_URL });
  const tmp = await mkdtemp(join(tmpdir(), "plinth-worker-sync-"));

  const published = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      currentVersionId: workspaces.currentVersionId,
    })
    .from(workspaces)
    .where(isNotNull(workspaces.currentVersionId));

  if (published.length === 0) {
    console.log("No workspace has a published version yet — publish first, then re-run.");
  }

  for (const workspace of published) {
    const [version] = await withWorkspace(db, workspace.id, (tx) =>
      tx
        .select({ versionNumber: contentVersions.versionNumber })
        .from(contentVersions)
        .where(eq(contentVersions.id, workspace.currentVersionId!)),
    );
    if (!version) {
      console.warn(`- ${workspace.slug}: current version row missing, skipped`);
      continue;
    }

    const hostname = `${workspace.slug}${HOST_SUFFIX}`;
    await wrangler([
      "kv",
      "key",
      "put",
      hostname,
      JSON.stringify({ workspaceId: workspace.id, versionNumber: version.versionNumber }),
      "--binding",
      "TENANT_HOSTS",
      "--local",
    ]);

    const siteCount = await syncPrefix(
      BUCKET,
      `tenants/${workspace.id}/v${version.versionNumber}/`,
      tmp,
    );
    const mediaCount = await syncPrefix(MEDIA_BUCKET, `tenants/${workspace.id}/`, tmp);

    console.log(
      `- ${hostname} → v${version.versionNumber} (${siteCount} site + ${mediaCount} media objects) — http://${hostname}:8787/`,
    );
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
