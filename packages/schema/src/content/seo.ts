import { z } from "zod";

import { mediaRef } from "./mediaRef";

/**
 * Per-page discovery metadata (ADR-0015). Deliberately small: a title, a
 * description, an optional share image, and a switch to keep a page out of
 * search results. Canonical URLs are derived from the page path at build time
 * rather than authored — a hand-typed canonical is a footgun that silently
 * de-indexes a page, and nothing about it is a content decision.
 *
 * `title` and `description` are optional because a page inherits the site's
 * defaults when it has nothing more specific to say. The publish gate is what
 * refuses a page that ends up with neither.
 */
export const pageSeo = z.object({
  title: z.string().trim().min(1).max(70).optional(),
  description: z.string().trim().min(1).max(160).optional(),
  ogImage: mediaRef.optional(),
  noindex: z.boolean().default(false),
});
export type PageSeo = z.infer<typeof pageSeo>;
