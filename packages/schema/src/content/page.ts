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
  /**
   * A link closing the footer note, so the sentence can end somewhere rather
   * than merely mentioning somewhere. Separate from the note because a link
   * inside free text would mean parsing markup out of a plain string, and the
   * whole point of prose-as-data here is that there is no markup to parse.
   */
  footerNoteLink: link.optional(),
  /**
   * Prepended to the studio cities on the closing line — "Built in Astro" and
   * the like. Its own field rather than more note, because it sits on the
   * opposite side of the footer and wraps independently.
   */
  footerCredit: shortText.optional(),
  social: z.array(link).max(8).default([]),
  /**
   * The footer's own link list, separate from `nav` on purpose. A footer
   * points at things a header cannot afford to — a section anchor partway
   * down a page, an entry that matters without being top-level — and merging
   * the two would force every addition here into the primary navigation.
   */
  footerLinks: z.array(link).max(8).default([]),
  /**
   * A standing call to action, rendered in the header and again at the foot
   * of the page. Optional because a site that is not soliciting anything
   * should not be made to invent a button.
   */
  cta: link.optional(),
  /** One line of copy above that call to action. */
  ctaBlurb: shortText.optional(),
  /**
   * Where enquiries reach a person when the form is not the route — the
   * footer links it directly, and it is the address a visitor falls back to
   * if a submission fails. Separate from `contactFormKey` below: one is who
   * receives, the other is how the service is addressed.
   */
  contactEmail: z.email().optional(),
  /** Displayed beside the address, and the organisation's `telephone` in
   * structured data. */
  contactPhone: shortText.optional(),
  /**
   * The year the organisation began, for structured data's `foundingDate`.
   * A number rather than a date because that is the granularity anyone
   * actually knows, and a fabricated month would be a fact nobody chose.
   */
  founded: z.number().int().min(1000).max(9999).optional(),
  /**
   * The addresses the footer lists. Deliberately the same shape as the
   * `locations` section rather than a reference to it: a section belongs to
   * one page and can be parked, while the footer is on every page, so
   * pointing at one would make the whole site's footer depend on whether an
   * author had finished editing the studio page.
   */
  locations: z
    .array(
      z.object({
        city: shortText,
        address: shortText,
        country: shortText,
      }),
    )
    .max(6)
    .default([]),
  /** Site-wide share image, used by any page whose SEO sets none. */
  ogImage: mediaRef.optional(),
  /**
   * Web3Forms access key — what a contact form posts alongside a submission
   * so the service knows which inbox to deliver to.
   *
   * A site setting rather than a template field because the platform picked
   * the provider, not the template: the edge widens a tenant's CSP for
   * `api.web3forms.com` only when this is set, and that decision is made in
   * the worker. A template that renders a form reads it; one that does not
   * ignores it.
   *
   * Not a secret. It authorises posting to one form and nothing else, and it
   * ships in the page's HTML by design — Web3Forms' own model. It is stored
   * in `content_drafts.document`, so it is also in the weekly database dump
   * and in every retained version snapshot; that is fine for a value the
   * published page already hands to every visitor, and it is written down
   * here so nobody has to rediscover it during an audit.
   */
  contactFormKey: z.string().trim().max(200).optional(),
});
export type SiteSettings = z.infer<typeof siteSettings>;
