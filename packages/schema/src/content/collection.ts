import { z } from "zod";

import { slug } from "./fieldTypes";
import { pageSeo } from "./seo";

/**
 * A collection is a page group: one path template, one entry shape, and an
 * ordered list of entries the builder fans out into a detail page each
 * (ADR-0015). It is what lets a tenant add a sixth project without a deploy —
 * the alternative was one hand-made page per project, which drifts from its
 * index the first time someone edits only one of them.
 *
 * Entry order is significant twice over: it is the order an index renders, and
 * it is what prev/next navigation walks. There is no separate sort field for
 * the same reason sections have none — a second source of order drifts from
 * the first.
 */

/** Exactly one `{slug}` placeholder, otherwise the same shape as a page path.
 * The builder substitutes per entry, so `/projects/{slug}/` yields
 * `/projects/salt-house/`. */
export const pathTemplate = z
  .string()
  .trim()
  .regex(
    /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*\{slug\}\/$/,
    "a trailing-slashed path ending in the `{slug}` segment, e.g. `/projects/{slug}/`",
  );

/** Resolve one entry's path from its collection template. */
export function resolveEntryPath(template: string, entrySlug: string): string {
  return template.replace("{slug}", entrySlug);
}

/**
 * Wraps a template's entry field schema into the stored entry shape.
 *
 * `enabled` carries the same weight it does on a page: publish validates
 * strictly, so one half-written entry would otherwise block the entire site —
 * every other page included — from publishing at all.
 */
export function entryInstanceFor<TFields extends z.ZodType>(fields: TFields) {
  return z.object({
    id: z.uuid(),
    slug,
    enabled: z.boolean().default(true),
    seo: pageSeo.default({ noindex: false }),
    fields,
  });
}

/** Slugs are unique within a collection: two entries sharing one would resolve
 * to the same path and the second would silently overwrite the first in R2. */
export function uniqueBySlug(items: { slug: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.slug)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "slug"],
        message: `duplicate slug "${item.slug}" — entries resolve to one path each`,
      });
    }
    seen.add(item.slug);
  }
}

export function collectionInstanceFor<TFields extends z.ZodType>(fields: TFields) {
  return z.object({
    pathTemplate,
    entries: z.array(entryInstanceFor(fields)).max(200).default([]).superRefine(uniqueBySlug),
  });
}

/** One stored entry, with template fields left unvalidated — the shape every
 * surface passes around before a template's own schema narrows `fields`. */
export const entryInstance = entryInstanceFor(z.unknown());
export type EntryInstance = z.infer<typeof entryInstance>;

/** An entry paired with the path it resolves to. Paths are computed once, at
 * the boundary that knows the template, so no renderer or editor ever has to
 * hold a path template. */
export interface ResolvedEntry {
  path: string;
  entry: EntryInstance;
}

/**
 * The entries a collection actually produces pages for, in array order, each
 * with its resolved path.
 *
 * Disabled entries are dropped here rather than at each call site, because
 * every consumer wants the same answer: the build emits no page for one, the
 * index must not link to one, and prev/next must not walk through one. A
 * neighbour pointing at a parked entry is a 404 reachable only by clicking
 * "next", which is exactly the kind of link nobody tests.
 */
export function livingEntries(collection: {
  pathTemplate: string;
  entries: EntryInstance[];
}): ResolvedEntry[] {
  return collection.entries
    .filter((entry) => entry.enabled)
    .map((entry) => ({ path: resolveEntryPath(collection.pathTemplate, entry.slug), entry }));
}

export interface WithNeighbors extends ResolvedEntry {
  /** Null only when this is the sole entry — see below. */
  prev: ResolvedEntry | null;
  next: ResolvedEntry | null;
}

/**
 * Attach cyclic prev/next to an ordered entry list — Norven's `withNeighbors`,
 * minus its `order` field. Array position is the order (ADR-0015): a separate
 * sort key is a second source of truth that drifts from the first the moment
 * someone reorders in one place.
 *
 * The wraparound is deliberate — from the last project, "next" returns to the
 * first, so the sequence has no dead end. The exception is a collection of one,
 * where the cycle would make both links point at the page they are on: a "next
 * project" that reloads the same project reads as broken, so both are null and
 * the template omits the control.
 */
export function withNeighbors(entries: ResolvedEntry[]): WithNeighbors[] {
  const count = entries.length;
  return entries.map((resolved, index) => ({
    ...resolved,
    prev: count > 1 ? entries[(index - 1 + count) % count]! : null,
    next: count > 1 ? entries[(index + 1) % count]! : null,
  }));
}
