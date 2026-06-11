import { z } from "zod";

/**
 * Field primitives — the complete vocabulary the editor knows how to render
 * as form controls. Templates compose these in their manifests; anything not
 * expressible here is deliberately not expressible (ADR-0001: field-based
 * editor, no free placement, no rich text by default).
 */

/** Short single-line text: titles, eyebrows, captions, nav labels. */
export const shortText = z.string().trim().min(1).max(200);

/** Multi-paragraph plain prose. Rich text is deliberately absent (ADR-0001);
 * a constrained long-prose field type would arrive via its own ADR. */
export const longText = z.string().trim().min(1).max(5000);

/** A link with a required visible label. `href` accepts an absolute URL or
 * a site-relative path (`/work`). */
export const link = z.object({
  label: shortText,
  href: z.union([z.url(), z.string().startsWith("/")]),
});
export type Link = z.infer<typeof link>;
