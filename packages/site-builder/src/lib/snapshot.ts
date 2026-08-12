import { readFileSync } from "node:fs";
import type { ResolvedCollections } from "@plinth/renderer";
import {
  livingEntries,
  parseContentDocument,
  withNeighbors,
  type EntryInstance,
  type LooseContentDocumentV2,
  type ResolvedEntry,
} from "@plinth/schema";

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
    const document = snapshot();
    const pages = document.pages.filter((page) => page.seo.noindex).map((page) => page.path);
    // Entries carry their own SEO, so one can be hidden from search without
    // being parked. Forgetting them here would have listed exactly the pages
    // an author had asked to keep out of the index.
    const entries = entryRoutes(document)
      .filter((route) => route.entry.seo.noindex)
      .map((route) => route.path);
    return [...pages, ...entries];
  } catch {
    // The config is also evaluated by tooling that never sets SNAPSHOT_PATH
    // (`astro check`, editor integrations). Excluding nothing is correct there.
    return [];
  }
}

export interface EntryRoute extends ResolvedEntry {
  collection: string;
  prev: ResolvedEntry | null;
  next: ResolvedEntry | null;
}

/**
 * Every detail page the snapshot produces: one per living entry, in array
 * order, with its neighbours already attached.
 *
 * Neighbours come from the same filtered list the routes do, so prev/next can
 * never point at a page this build did not emit.
 */
export function entryRoutes(document = snapshot()): EntryRoute[] {
  return Object.entries(document.collections).flatMap(([collection, value]) =>
    withNeighbors(livingEntries(value as { pathTemplate: string; entries: EntryInstance[] })).map(
      (item) => ({ ...item, collection }),
    ),
  );
}

/**
 * The entries an index section renders, keyed by collection name. Resolved
 * once here rather than per section: a section that built its own paths would
 * need the path template, which is document structure a leaf has no business
 * reading.
 */
export function resolvedCollections(document = snapshot()): ResolvedCollections {
  return Object.fromEntries(
    Object.entries(document.collections).map(([collection, value]) => [
      collection,
      livingEntries(value as { pathTemplate: string; entries: EntryInstance[] }),
    ]),
  );
}

/**
 * Fails the build when a page and a collection entry claim the same path.
 *
 * Two routes at one path is not a conflict Astro reports — the second write
 * wins in R2 and the loser reads as a page that simply did not publish. The
 * publish gate refuses this first, so reaching it means a snapshot was built
 * by some other route (a hand-run build, a rollback across a schema change);
 * failing loudly is still better than shipping whichever one happened to be
 * uploaded last.
 */
export function assertUniquePaths(routes: { path: string }[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.path)) {
      throw new Error(
        `Two routes resolve to "${route.path}" — a page and a collection entry ` +
          `cannot share a path, because one would overwrite the other in R2.`,
      );
    }
    seen.add(route.path);
  }
}
