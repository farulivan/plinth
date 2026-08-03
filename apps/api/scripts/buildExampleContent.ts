/**
 * Regenerate the committed example-content fixture the tenant quality gates
 * build against: a snapshot document plus the media variants it references.
 *
 * The fixture exists so the tenant lane runs service-free — no Postgres, no
 * R2, no Inngest — while still auditing a real build with real bytes. Stubbed
 * images would make `uses-responsive-images`, `image-delivery-insight` and LCP
 * meaningless, which are exactly the audits the gates are there to hold.
 *
 * Hashing and encoding come from the production media pipeline (`hashBody`,
 * `processImage`), so a committed fixture cannot drift from what a real upload
 * would produce. Photos come from the sibling norven checkout:
 *   NORVEN_DIR overrides the default ../../../norven
 *
 * One-shot, run by hand after the template manifest or the encoder changes:
 *   pnpm example-content
 */
/* eslint-disable turbo/no-undeclared-env-vars -- one-shot script, never a
 * cached turbo task; its env vars are not build inputs. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashBody } from "@plinth/internal-rpc";
import { norvenDocument } from "@plinth/template-norven/manifest";
import { processImage } from "../src/modules/media/encode";

const NORVEN_DIR = resolve(import.meta.dirname, process.env.NORVEN_DIR ?? "../../../../norven");
const OUT_DIR = resolve(import.meta.dirname, "../../../packages/template-norven/example-content");

interface Ingested {
  contentHash: string;
  width: number;
  height: number;
}

/** Encode one source image into the fixture's media tree and return the
 * `mediaRef` facts the document needs. Mirrors `uploadMedia` minus the db. */
async function ingest(path: string): Promise<Ingested> {
  const bytes = await readFile(path);
  const contentHash = hashBody(bytes);
  const { width, height, variants } = await processImage(bytes);

  const dir = join(OUT_DIR, "media", contentHash);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    variants.map((variant) =>
      writeFile(join(dir, `w${variant.width}.${variant.format}`), variant.bytes),
    ),
  );

  console.log(
    `[example-content] ${path.split("/").at(-1)} → ${contentHash.slice(0, 12)}… ` +
      `(${width}×${height}, ${variants.length} variants)`,
  );
  return { contentHash, width, height };
}

/** `mediaId` is a stable fake here: the fixture is never loaded into Postgres,
 * and the renderer resolves variants by content hash, not by id. Keeping the
 * key present matters — the orphaned-media reaper finds references by scanning
 * serialized JSON for `"mediaId"`, so the shape must stay honest. */
const ref = (item: Ingested, mediaId: string, alt: string) => ({
  mediaId,
  alt,
  contentHash: item.contentHash,
  width: item.width,
  height: item.height,
});

async function main(): Promise<void> {
  await rm(join(OUT_DIR, "media"), { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const assets = join(NORVEN_DIR, "src");
  const hero = await ingest(join(assets, "assets/hero.jpg"));
  const cover = (slug: string) => ingest(join(assets, `content/projects/${slug}/cover.jpg`));
  const saltHouse = await cover("salt-house");
  const obsidian = await cover("obsidian-pavilion");
  const terraWorks = await cover("terra-works");
  const holmChapel = await cover("holm-chapel");
  const nordStrata = await cover("nord-strata-tower");

  // The landing page verbatim, matching what `seed:norven` writes to a real
  // draft — the gates audit the page the first tenant actually publishes.
  const document = norvenDocument.parse({
    sections: [
      {
        type: "photoHero",
        fields: {
          eyebrow: "Norven · Est. 2009",
          title: "Architecture\nof consequence.",
          subtitle:
            "Norven is an architecture practice working on residences, cultural buildings, and landscapes across Northern Europe and beyond.",
          photo: ref(
            hero,
            "00000000-0000-4000-8000-000000000001",
            "Norven — architecture of consequence",
          ),
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
              image: ref(
                saltHouse,
                "00000000-0000-4000-8000-000000000002",
                "Salt House — coastal residence above the Skagerrak",
              ),
            },
            {
              title: "Obsidian Pavilion",
              meta: "Cultural · 2024 · Built",
              location: "Þingvellir, Iceland · 640 m²",
              brief:
                "A reading room and lava-field interpretive structure at the seam between the North American and Eurasian plates. Vertical, narrow, deliberately weightless.",
              image: ref(
                obsidian,
                "00000000-0000-4000-8000-000000000003",
                "Obsidian Pavilion — interpretive structure at Þingvellir",
              ),
            },
            {
              title: "Terra Works",
              meta: "Commercial · 2025 · Built",
              location: "Marvila, Lisbon · 4,200 m²",
              brief:
                "Adaptive reuse of a 1937 ceramics warehouse into studio offices for nine creative tenants. Original shell retained; programme built as freestanding timber inserts.",
              image: ref(
                terraWorks,
                "00000000-0000-4000-8000-000000000004",
                "Terra Works — adaptive reuse of a ceramics warehouse",
              ),
            },
            {
              title: "Holm Chapel",
              meta: "Civic · 2022 · Built",
              location: "Higashiyama, Kyoto · 180 m²",
              brief:
                "A non-denominational chapel for a small university campus. One room, one bench, one light cut down through three storeys of rammed earth.",
              image: ref(
                holmChapel,
                "00000000-0000-4000-8000-000000000005",
                "Holm Chapel — rammed-earth chapel in Kyoto",
              ),
            },
            {
              title: "Nord-Strata Tower",
              meta: "Cultural · 2026 · In Studio",
              location: "Reykjavík · 6,800 m²",
              brief:
                "A vertical archive and exhibition tower for the Nordic Council. Sixteen plates stacked around a central daylight void, sequenced by epoch.",
              image: ref(
                nordStrata,
                "00000000-0000-4000-8000-000000000006",
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

  await writeFile(join(OUT_DIR, "norven.json"), JSON.stringify(document, null, 2) + "\n");
  console.log(`[example-content] wrote norven.json (${document.sections.length} sections)`);
}

main().catch((err: unknown) => {
  console.error("[example-content] failed:", err);
  process.exitCode = 1;
});
