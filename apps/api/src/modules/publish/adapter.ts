import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { LooseContentDocument } from "@plinth/schema";
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

/**
 * Runs `astro build` in packages/site-builder against a snapshot file
 * (ADR-0013): the snapshot goes to a temp dir, the builder reads it via env,
 * and the output lands next to it — concurrent builds never share paths.
 * Returns the built site's directory.
 */
export async function runSiteBuild(input: {
  versionId: string;
  templateId: string;
  snapshot: LooseContentDocument;
}): Promise<{ outDir: string }> {
  const workDir = await mkdtemp(join(tmpdir(), `plinth-build-${input.versionId}-`));
  const snapshotPath = join(workDir, "snapshot.json");
  const outDir = join(workDir, "dist");
  await writeFile(snapshotPath, JSON.stringify(input.snapshot), "utf8");

  // pnpm resolves the workspace from any cwd inside the repo, so this works
  // from apps/api in dev. The production api image cannot run this yet — it
  // ships only the tsup bundle (ADR-0013 records the gap and the plan).
  await execFileAsync("pnpm", ["--filter", "@plinth/site-builder", "run", "build:site"], {
    env: {
      ...process.env,
      SNAPSHOT_PATH: snapshotPath,
      TEMPLATE_ID: input.templateId,
      OUT_DIR: outDir,
    },
    timeout: BUILD_TIMEOUT_MS,
  });

  return { outDir };
}

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
  for (const entry of files) {
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
  }
  return { files: files.length };
}
