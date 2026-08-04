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
