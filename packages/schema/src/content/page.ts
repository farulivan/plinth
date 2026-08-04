import { z } from "zod";

import { link, shortText } from "./fieldTypes";
import { mediaRef } from "./mediaRef";
import { pageSeo } from "./seo";

/**
 * A page: a path, its discovery metadata, and an ordered list of sections
 * (ADR-0015). Sections are unique per page rather than per document, which is
 * what lets two pages both carry a `photoHero`.
 *
 * `enabled` exists for the same reason it exists on a section. The publish
 * gate validates strictly, so a half-written page would otherwise block the
 * whole site from publishing — including every page the author had finished.
 * A parked page is skipped by the build and by validation alike.
 */

/** Site-absolute, always trailing-slashed except for the root. One shape means
 * the builder never has to guess whether `/studio` and `/studio/` are the same
 * page, and the worker's directory-index fallback resolves them identically. */
export const pagePath = z
  .string()
  .trim()
  .regex(
    /^\/$|^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/,
    "site-absolute lowercase path with a trailing slash, e.g. `/` or `/studio/`",
  );

/** Reserved by the platform: `/_media/*` is the media variant prefix the worker
 * resolves (ADR-0014), and `/_astro/*` is where the build writes its bundles. A
 * page there would be shadowed by one and would shadow the other. */
const RESERVED_PREFIXES = ["/_media/", "/_astro/"];

export function pageInstanceFor<TSection extends z.ZodType<{ type: string }>>(section: TSection) {
  return z.object({
    /** Stable across path edits — the editor keys form state on it, and a page
     * that changed identity when renamed would reset the form mid-typing. */
    id: z.uuid(),
    path: pagePath.refine(
      (value) => !RESERVED_PREFIXES.some((prefix) => value.startsWith(prefix)),
      "paths under /_media/ and /_astro/ are reserved by the platform",
    ),
    /** Nav label. Absent means the page exists but is not offered in the nav. */
    navLabel: shortText.optional(),
    enabled: z.boolean().default(true),
    seo: pageSeo.default({ noindex: false }),
    sections: z.array(section).min(1).superRefine(uniqueByType),
  });
}

/** Section types are unique within a page. Array position is render order, so
 * there is no separate order field to drift from it (ADR-0001). */
export function uniqueByType(items: { type: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.type)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "type"],
        message: `duplicate section type "${item.type}" — sections are unique per page`,
      });
    }
    seen.add(item.type);
  }
}

/** Site-wide settings: the chrome every page renders and the metadata a page
 * falls back to. Kept flat — this is a settings form, not a content tree. */
/**
 * `name` and `description` allow the empty string on purpose, and this is
 * load-bearing rather than lax. Storage is the loose half of ADR-0007's
 * loose-save / strict-publish split, and the v1 upgrade seeds both blank
 * because v1 had nowhere to carry them. Requiring them here would mean an
 * upgraded document could be produced and then never read back — the draft
 * would parse once, save, and fail every subsequent load. The publish gate is
 * what refuses to ship a site with no name.
 */
export const siteSettings = z.object({
  name: z.string().trim().max(200),
  /** Falls back to this when a page sets no description of its own. */
  description: z.string().trim().max(160),
  nav: z.array(link).max(8).default([]),
  footerNote: z.string().trim().min(1).max(300).optional(),
  social: z.array(link).max(8).default([]),
  /** Site-wide share image, used by any page whose SEO sets none. */
  ogImage: mediaRef.optional(),
});
export type SiteSettings = z.infer<typeof siteSettings>;
