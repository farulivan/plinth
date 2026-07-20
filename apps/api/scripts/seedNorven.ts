/**
 * Layer the full Norven landing page onto the seeded workspace (M6): ingest
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
import { contentDrafts, workspaces } from "@plinth/db/schema";
import type { MediaItem } from "@plinth/schema/api";
import { norvenDocument } from "@plinth/template-norven/manifest";
import { eq } from "drizzle-orm";
import { uploadMedia } from "../src/modules/media/service";

const NORVEN_DIR = resolve(import.meta.dirname, process.env.NORVEN_DIR ?? "../../../../norven");

const connectionString =
  process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth";

async function ingest(db: Db, workspaceId: string, path: string): Promise<MediaItem> {
  const bytes = await readFile(path);
  const result = await uploadMedia(db, { workspaceId, bytes });
  if (result.outcome !== "created" && result.outcome !== "reused") {
    throw new Error(`ingest failed for ${path}: ${result.outcome}`);
  }
  console.log(`[seed:norven] ${result.outcome} ${path.split("/").at(-1)} (${result.item.width}px)`);
  return result.item;
}

const ref = (item: MediaItem, alt: string) => ({
  mediaId: item.id,
  alt,
  contentHash: item.contentHash,
  width: item.width,
  height: item.height,
});

async function main(): Promise<void> {
  const { db, pool } = createDb({ connectionString, max: 3 });
  try {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, "norven"));
    if (!workspace) throw new Error('workspace "norven" not found — run `pnpm seed` first');

    const assets = join(NORVEN_DIR, "src");
    const hero = await ingest(db, workspace.id, join(assets, "assets/hero.jpg"));
    const cover = (slug: string) =>
      ingest(db, workspace.id, join(assets, `content/projects/${slug}/cover.jpg`));
    const saltHouse = await cover("salt-house");
    const obsidian = await cover("obsidian-pavilion");
    const terraWorks = await cover("terra-works");
    const holmChapel = await cover("holm-chapel");
    const nordStrata = await cover("nord-strata-tower");

    // The landing page verbatim (norven's index.astro composition + data
    // files), expressed as CMS content.
    const document = norvenDocument.parse({
      sections: [
        {
          type: "photoHero",
          fields: {
            eyebrow: "Norven · Est. 2009",
            title: "Architecture\nof consequence.",
            subtitle:
              "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
            photo: ref(hero, "Norven — architecture of consequence"),
          },
        },
        {
          type: "statement",
          fields: {
            eyebrow: "The practice",
            body: "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
          },
        },
        {
          type: "featuredProjects",
          fields: {
            heading: "Selected work",
            items: [
              {
                title: "Salt House",
                meta: "Residence · 2023 · Built",
                location: "Tjøme, Norway · 280 m²",
                brief:
                  "A coastal residence cut into a granite shelf above the Skagerrak. Three volumes stepped down the slope, a single oak stair binding them.",
                image: ref(saltHouse, "Salt House — coastal residence above the Skagerrak"),
              },
              {
                title: "Obsidian Pavilion",
                meta: "Cultural · 2024 · Built",
                location: "Þingvellir, Iceland · 640 m²",
                brief:
                  "A reading room and lava-field interpretive structure at the seam between the North American and Eurasian plates. Vertical, narrow, deliberately weightless.",
                image: ref(obsidian, "Obsidian Pavilion — interpretive structure at Þingvellir"),
              },
              {
                title: "Terra Works",
                meta: "Commercial · 2025 · Built",
                location: "Marvila, Lisbon · 4,200 m²",
                brief:
                  "Adaptive reuse of a 1937 ceramics warehouse into studio offices for nine creative tenants. Original shell retained; programme built as freestanding timber inserts.",
                image: ref(terraWorks, "Terra Works — adaptive reuse of a ceramics warehouse"),
              },
              {
                title: "Holm Chapel",
                meta: "Civic · 2022 · Built",
                location: "Higashiyama, Kyoto · 180 m²",
                brief:
                  "A non-denominational chapel for a small university campus. One room, one bench, one light cut down through three storeys of rammed earth.",
                image: ref(holmChapel, "Holm Chapel — rammed-earth chapel in Kyoto"),
              },
              {
                title: "Nord-Strata Tower",
                meta: "Cultural · 2026 · In Studio",
                location: "Reykjavík · 6,800 m²",
                brief:
                  "A vertical archive and exhibition tower for the Nordic Council. Sixteen plates stacked around a central daylight void, sequenced by epoch.",
                image: ref(
                  nordStrata,
                  "Nord-Strata Tower — vertical archive for the Nordic Council",
                ),
              },
            ],
          },
        },
        {
          type: "stats",
          fields: {
            items: [
              { value: "118", label: "Built" },
              { value: "26", label: "In studio" },
              { value: "42", label: "Awards & citations" },
              { value: "17", label: "Years continuous practice" },
            ],
          },
        },
        {
          type: "testimonial",
          fields: {
            attribution: "Client, Salt House",
            context: "Tjøme · 2023",
            quote:
              "They drew our house the way you would a portrait of someone you had known for fifty years. Nothing was decorative, nothing was lazy. We have lived in it for three winters now and have not found a single thing we would change.",
            name: "Margrét Sól",
          },
        },
        {
          type: "contact",
          fields: {
            eyebrow: "Bring us a site",
            heading: "Bring us a site,\na story,\na single hour of light.",
            email: "studio@norven.example",
            phone: "+47 22 00 00 00",
            studios: [
              { city: "Oslo", address: "Akersgata 12, 0158" },
              { city: "Lisbon", address: "Rua das Janelas Verdes 9" },
              { city: "Kyoto", address: "Higashiyama, Sanjō 3-15" },
            ],
          },
        },
      ],
    });

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
