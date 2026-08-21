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
import { norvenContent, type MakeRef, type NorvenMedia } from "./norvenContent";
import { processImage } from "../src/modules/media/encode";

const NORVEN_DIR = resolve(import.meta.dirname, process.env.NORVEN_DIR ?? "../../../../norven");
const OUT_DIR = resolve(import.meta.dirname, "../../../packages/template-norven/example-content");

interface Ingested {
  contentHash: string;
  width: number;
  height: number;
  widths: number[];
}

/** Encode one source image into the fixture's media tree and return the
 * `mediaRef` facts the document needs. Mirrors `uploadMedia` minus the db. */
async function ingest(path: string): Promise<Ingested> {
  const bytes = await readFile(path);
  const contentHash = hashBody(bytes);
  const { width, height, widths, variants } = await processImage(bytes);

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
  return { contentHash, width, height, widths };
}

/** `mediaId` is a stable fake here: the fixture is never loaded into Postgres,
 * and the renderer resolves variants by content hash, not by id. Keeping the
 * key present matters — the orphaned-media reaper finds references by scanning
 * serialized JSON for `"mediaId"`, so the shape must stay honest. */
const makeRef =
  (item: Ingested, index: number): MakeRef =>
  (alt: string) => ({
    mediaId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    alt,
    contentHash: item.contentHash,
    width: item.width,
    height: item.height,
    // Recorded exactly as a real pick records it — the fixture asserts the
    // renderer asks only for variants that were written, so a ref that lied
    // here would turn the tenant gates green against missing images.
    widths: item.widths,
  });

async function main(): Promise<void> {
  await rm(join(OUT_DIR, "media"), { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const assets = join(NORVEN_DIR, "src");
  const cover = (slug: string) => ingest(join(assets, `content/projects/${slug}/cover.jpg`));
  const ingested = {
    hero: await ingest(join(assets, "assets/hero.jpg")),
    saltHouse: await cover("salt-house"),
    obsidian: await cover("obsidian-pavilion"),
    terraWorks: await cover("terra-works"),
    holmChapel: await cover("holm-chapel"),
    nordStrata: await cover("nord-strata-tower"),
  };

  // Content comes from the shared module, so the fixture the gates audit and
  // the draft `seed:norven` writes cannot describe different sites.
  const media = Object.fromEntries(
    Object.entries(ingested).map(([name, item], index) => [name, makeRef(item, index)]),
  ) as unknown as NorvenMedia;

  // One project's photographs, not all five. The gates need a gallery to
  // audit — without one, the component's captions, its figure markup and its
  // lazy-loading are never measured on any page — but twenty photographs
  // through the encoder would add tens of megabytes to a fixture that is
  // committed, and the twenty-first would prove nothing the fourth did not.
  const galleryDir = join(assets, "content/projects/salt-house");
  const saltHouseGallery = [];
  for (const file of ["photo-1.jpg", "photo-2.jpg", "photo-3.jpg", "photo-4.jpg"]) {
    saltHouseGallery.push(await ingest(join(galleryDir, file)));
  }
  media.gallery = {
    "salt-house": saltHouseGallery.map((item, index) => makeRef(item, 100 + index)),
  };

  // All three portraits, unlike the galleries. They are one image per person
  // rather than four per project, and the section they sit in renders nothing
  // at all without them — a principals list with two of three faces would
  // audit a layout the site never shows.
  const portraits: Record<string, Ingested> = {};
  for (const slug of ["anders-lien", "pedro-carvalho", "yuki-sato"]) {
    portraits[slug] = await ingest(join(assets, `content/team/${slug}/portrait.jpg`));
  }
  media.portraits = Object.fromEntries(
    Object.entries(portraits).map(([slug, item], index) => [slug, makeRef(item, 200 + index)]),
  );

  const document = norvenDocument.parse(
    norvenContent(media, {
      // A placeholder rather than an empty string. The form only renders when
      // a key is present, so without one the fixture audited a contact page
      // that had no form on it — Lighthouse and axe never saw the labels, the
      // select, or the live region. The fixture is never published, and the
      // key is public by design even when real.
      contactFormKey: process.env.WEB3FORMS_ACCESS_KEY ?? "example-content-placeholder-key",
    }),
  );

  await writeFile(join(OUT_DIR, "norven.json"), JSON.stringify(document, null, 2) + "\n");
  console.log(
    `[example-content] wrote norven.json (${String(document.pages.length)} pages, ` +
      `${String((document.collections as { projects?: { entries: unknown[] } }).projects?.entries.length ?? 0)} project entries)`,
  );
}

main().catch((err: unknown) => {
  console.error("[example-content] failed:", err);
  process.exitCode = 1;
});
