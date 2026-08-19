import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { LooseContentDocumentV2 } from "@plinth/schema";
import { inngest } from "../../inngest/client";
import { env } from "../../lib/env";
import { s3 } from "../../lib/s3";
import { contentTypeFor } from "./contentTypes";

/**
 * External boundary of the publish domain (ADR-0009): the Inngest queue, the
 * out-of-process Astro build, and the R2 bucket. Never imports service or db.
 */

const execFileAsync = promisify(execFile);

/** Astro's budget is 60 s (ADR-0003); the hard kill leaves headroom for cold
 * vite caches before Inngest's retry takes over. */
const BUILD_TIMEOUT_MS = 180_000;

export async function enqueuePublish(input: {
  workspaceId: string;
  versionId: string;
  versionNumber: number;
}): Promise<void> {
  await inngest.send({ name: "site/publish.requested", data: input });
}

/** Announce a pointer swap that happened outside the build job (rollback) so
 * the KV-sync function converges the edge, same as a promote (ADR-0004). */
export async function emitPromoted(input: {
  workspaceId: string;
  versionId: string;
  versionNumber: number;
}): Promise<void> {
  await inngest.send({ name: "site/version.promoted", data: input });
}

/**
 * Runs `astro build` in packages/site-builder against a snapshot file
 * (ADR-0013): the snapshot goes to a temp dir, the builder reads it via env,
 * and the output lands next to it — concurrent builds never share paths.
 *
 * Returns the built site's directory *and* the temp root that contains it, so
 * the caller can drop the whole tree when it is done — see removeBuildDir.
 */
export async function runSiteBuild(input: {
  versionId: string;
  templateId: string;
  /** The tenant's own origin. The build needs it for canonical URLs, absolute
   * Open Graph URLs and the sitemap — none of which can be derived from the
   * snapshot, and all of which are wrong rather than absent if guessed. */
  siteUrl: string;
  snapshot: LooseContentDocumentV2;
}): Promise<{ outDir: string; workDir: string }> {
  const workDir = await mkdtemp(join(tmpdir(), `plinth-build-${input.versionId}-`));
  const snapshotPath = join(workDir, "snapshot.json");
  const outDir = join(workDir, "dist");
  await writeFile(snapshotPath, JSON.stringify(input.snapshot), "utf8");

  // pnpm resolves the workspace from any cwd inside the repo, so this works
  // from apps/api in dev and from the production image's WORKDIR alike — the
  // Dockerfile carries the whole pruned monorepo tree forward specifically
  // so this call has a workspace to resolve (ADR-0013).
  await execFileAsync("pnpm", ["--filter", "@plinth/site-builder", "run", "build:site"], {
    env: {
      ...process.env,
      SNAPSHOT_PATH: snapshotPath,
      TEMPLATE_ID: input.templateId,
      SITE_URL: input.siteUrl,
      OUT_DIR: outDir,
    },
    timeout: BUILD_TIMEOUT_MS,
  });

  return { outDir, workDir };
}

/**
 * Drops a finished build's temp tree. Nothing removed it before, so every
 * publish left a full `dist/` plus its snapshot behind in the machine's tmpdir
 * until the machine cycled — a slow disk leak on a 512 MB shared VM
 * (apps/api/fly.toml), and one that grows fastest exactly when publishing is
 * busiest.
 *
 * Best-effort by design: once the bytes are in R2 the publish has succeeded,
 * and failing it over a leftover directory would turn a housekeeping problem
 * into a user-visible one.
 */
export async function removeBuildDir(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[publish] could not remove build dir ${workDir}:`, error);
  }
}

/**
 * How many objects go up at once.
 *
 * Serial uploads were the original shape and they do not scale with the page
 * count: a tenant site is ~40 objects today and every page an author adds is
 * another handful, at 50–150 ms of round trip each. That time is spent inside
 * the single build-and-upload step, so it competes with ADR-0003's budget —
 * and because building and uploading deliberately share a step, running out
 * of time re-runs the Astro build as well as the upload.
 *
 * Eight rather than the highest number R2 tolerates. The bound that matters
 * is not the bucket, which would not notice ten times this; it is the 512 MB
 * machine holding one file buffer per worker while `astro build`'s memory has
 * only just been released.
 */
const UPLOAD_CONCURRENCY = 8;

/** Uploads a built site to `tenants/{workspaceId}/v{N}/…` (ADR-0003's
 * content-addressed layout — new versions never overwrite old paths, so the
 * CDN needs no invalidation). Returns the object count. */
export async function uploadSiteDir(input: {
  workspaceId: string;
  versionNumber: number;
  dir: string;
}): Promise<{ files: number }> {
  const entries = await readdir(input.dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());

  const put = async (entry: (typeof files)[number]): Promise<void> => {
    const absolute = join(entry.parentPath, entry.name);
    const key = [
      "tenants",
      input.workspaceId,
      `v${input.versionNumber}`,
      relative(input.dir, absolute).split("\\").join("/"),
    ].join("/");
    await s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_SITES,
        Key: key,
        Body: await readFile(absolute),
        ContentType: contentTypeFor(entry.name),
      }),
    );
  };

  // A shared cursor rather than fixed-size batches: batching waits for its
  // slowest member before starting the next group, and these files range from
  // a 200-byte robots.txt to a 150 KB script, so a batch is only as fast as
  // whichever large file it happened to contain. This keeps exactly
  // UPLOAD_CONCURRENCY requests in flight until the work runs out.
  let cursor = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = cursor++;
      if (index >= files.length) return;
      try {
        await put(files[index]!);
      } catch (error) {
        // Stop drawing new work. The step retries and re-PUTs everything —
        // paths are per-version, so a partial upload is overwritten rather
        // than merged — but there is no reason to spend the rest of the
        // budget on an attempt already known to be failing.
        failed = true;
        throw error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => worker()),
  );
  return { files: files.length };
}
