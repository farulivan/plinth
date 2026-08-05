import { readFileSync } from "node:fs";
import { type LooseContentDocumentV2, parseContentDocument } from "@plinth/schema";

/**
 * The snapshot this build renders, read once.
 *
 * Memoized because three callers need it and two of them cannot pass it to
 * each other: `astro.config.mjs` (to exclude noindex pages from the sitemap)
 * and the page modules run in the same process but have no shared parameter.
 * Reading the file per caller would be harmless today and wrong the moment a
 * caller expects two reads to agree.
 *
 * Throwing here fails the astro build, which the publish job reports as a
 * failed version — an invalid snapshot must never publish silently.
 */

let cached: LooseContentDocumentV2 | null = null;

export function snapshot(): LooseContentDocumentV2 {
  if (cached) return cached;

  const path = process.env.SNAPSHOT_PATH;
  if (!path) throw new Error("SNAPSHOT_PATH is required (ADR-0013).");

  // Upgrades a v1 snapshot on read, so a rollback to a version published
  // before the pages migration still builds (docs/migrations.md).
  cached = parseContentDocument(JSON.parse(readFileSync(path, "utf8")));
  return cached;
}

/** The tenant's origin. Absent when building by hand, in which case canonical
 * and Open Graph URLs are omitted rather than guessed — a canonical pointing
 * at the wrong host is worse than none. */
export function siteUrl(): string | null {
  return process.env.SITE_URL ?? null;
}

/**
 * A page path as `[...path]` wants it: no leading or trailing slash, and
 * `undefined` for the root.
 *
 * The root is the trap. An empty string produces no route at all — Astro needs
 * the parameter absent to emit `index.html` — so returning `""` silently drops
 * the home page from the build while every other page works.
 */
export function pageParam(path: string): string | undefined {
  const trimmed = path.replace(/^\/|\/$/g, "");
  return trimmed === "" ? undefined : trimmed;
}

/** Paths the sitemap must not list. Read from the snapshot rather than passed,
 * because the sitemap filter runs inside the astro config. */
export function noindexPaths(): string[] {
  try {
    return snapshot()
      .pages.filter((page) => page.seo.noindex)
      .map((page) => page.path);
  } catch {
    // The config is also evaluated by tooling that never sets SNAPSHOT_PATH
    // (`astro check`, editor integrations). Excluding nothing is correct there.
    return [];
  }
}
