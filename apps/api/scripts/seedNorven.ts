/**
 * Layer the full Norven landing page onto the seeded workspace: ingest
 * the real photography through the SAME media pipeline user uploads take
 * (sniff, dedupe, Sharp variants, R2), then replace the draft with the
 * six-section document referencing those media rows. Idempotent — media
 * dedupes by content hash and the draft is replaced wholesale.
 *
 * Photos come from the sibling norven checkout (a dev-only convenience;
 * production content is uploaded once through the dashboard):
 *   NORVEN_DIR overrides the default ../../../norven
 *
 * Run after `pnpm seed`:  pnpm seed:norven   (root convenience script)
 */
/* eslint-disable turbo/no-undeclared-env-vars -- one-shot script, never a
 * cached turbo task; its env vars are not build inputs. */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDb, withWorkspace, type Db } from "@plinth/db";
import { contentDrafts, users, workspaceMemberships, workspaces } from "@plinth/db/schema";
import type { MediaItem } from "@plinth/schema/api";
import { parseContentDocument } from "@plinth/schema";
import { norvenDocument } from "@plinth/template-norven/manifest";
import { norvenContent, type MakeRef, type NorvenMedia } from "./norvenContent";
import { eq } from "drizzle-orm";
import { uploadMedia } from "../src/modules/media/service";

const NORVEN_DIR = resolve(import.meta.dirname, process.env.NORVEN_DIR ?? "../../../../norven");

const connectionString =
  process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth";

async function ingest(
  db: Db,
  workspaceId: string,
  actorUserId: string,
  path: string,
): Promise<MediaItem> {
  const bytes = await readFile(path);
  const result = await uploadMedia(db, { workspaceId, bytes, actorUserId });
  if (result.outcome === "unsupported-type" || result.outcome === "unreadable-image") {
    throw new Error(`ingest failed for ${path}: ${result.outcome}`);
  }
  if (result.outcome === "too-large" || result.outcome === "storage-cap") {
    throw new Error(`ingest failed for ${path}: ${result.outcome}`);
  }
  console.log(`[seed:norven] ${result.outcome} ${path.split("/").at(-1)} (${result.item.width}px)`);
  return result.item;
}

const makeRef =
  (item: MediaItem): MakeRef =>
  (alt: string) => ({
    mediaId: item.id,
    alt,
    contentHash: item.contentHash,
    width: item.width,
    height: item.height,
    ...(item.widths ? { widths: item.widths } : {}),
  });

async function main(): Promise<void> {
  const { db, pool } = createDb({ connectionString, max: 3 });
  try {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, "norven"));
    if (!workspace) throw new Error('workspace "norven" not found — run `pnpm seed` first');

    // uploadMedia writes an audit row, which wants a real actor. The seed's
    // owner is that actor: attributing the ingest to nobody left the column
    // null, which the table permits and every reader then has to special-case.
    const [owner] = await db
      .select({ id: users.id })
      .from(workspaceMemberships)
      .innerJoin(users, eq(workspaceMemberships.userId, users.id))
      .where(eq(workspaceMemberships.workspaceId, workspace.id));
    if (!owner) throw new Error('workspace "norven" has no member — run `pnpm seed` first');

    const assets = join(NORVEN_DIR, "src");
    const cover = (slug: string) =>
      ingest(db, workspace.id, owner.id, join(assets, `content/projects/${slug}/cover.jpg`));
    const ingested = {
      hero: await ingest(db, workspace.id, owner.id, join(assets, "assets/hero.jpg")),
      saltHouse: await cover("salt-house"),
      obsidian: await cover("obsidian-pavilion"),
      terraWorks: await cover("terra-works"),
      holmChapel: await cover("holm-chapel"),
      nordStrata: await cover("nord-strata-tower"),
    };

    // Every project's photographs. A real seed ingests all of them — the
    // committed fixture takes one set to keep its size sane, but a published
    // site with four empty project galleries is the visible half of this.
    const galleries: Record<string, MediaItem[]> = {};
    for (const slug of [
      "salt-house",
      "obsidian-pavilion",
      "terra-works",
      "holm-chapel",
      "nord-strata-tower",
    ]) {
      const photos: MediaItem[] = [];
      for (const file of ["photo-1.jpg", "photo-2.jpg", "photo-3.jpg", "photo-4.jpg"]) {
        photos.push(
          await ingest(
            db,
            workspace.id,
            owner.id,
            join(assets, `content/projects/${slug}/${file}`),
          ),
        );
      }
      galleries[slug] = photos;
    }

    // Content comes from the shared module, so a real draft and the fixture
    // the tenant gates audit cannot describe different sites.
    // Two schemas, two jobs: the template one rejects content the sections
    // would not render, then the stored envelope is what the column holds.
    const media = Object.fromEntries(
      Object.entries(ingested).map(([name, item]) => [name, makeRef(item)]),
    ) as unknown as NorvenMedia;
    media.gallery = Object.fromEntries(
      Object.entries(galleries).map(([slug, items]) => [slug, items.map(makeRef)]),
    );

    const document = parseContentDocument(
      norvenDocument.parse(
        norvenContent(media, { contactFormKey: process.env.WEB3FORMS_ACCESS_KEY ?? "" }),
      ),
    );

    await withWorkspace(db, workspace.id, (tx) =>
      tx
        .insert(contentDrafts)
        .values({ workspaceId: workspace.id, document })
        .onConflictDoUpdate({ target: contentDrafts.workspaceId, set: { document } }),
    );

    console.log("[seed:norven] draft replaced with the full landing page — publish when ready");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[seed:norven] failed:", err);
  process.exitCode = 1;
});
