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

/**
 * Body copy as an ordered list of paragraphs, each rendered as its own `<p>`
 * (ADR-0015 — the long-prose type ADR-0001 anticipated).
 *
 * Paragraphs rather than one markdown string: a template renders structure it
 * can style, and there is no parser, no sanitiser and no HTML-bearing string
 * anywhere in the pipeline. Inline emphasis and inline links are the price,
 * and are deliberately not paid for until a tenant needs them — adding them
 * later means a richer element type inside this array, not a different field.
 */
export const prose = z.array(longText).min(1).max(40);
export type Prose = z.infer<typeof prose>;

/**
 * URL path segment — lowercase, digits and single hyphens, no leading or
 * trailing hyphen. This is what a collection entry contributes to its
 * generated path, so it has to survive being pasted into a URL untouched.
 */
export const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");

/** A link with a required visible label. `href` accepts an absolute URL or
 * a site-relative path (`/work`). */
export const link = z.object({
  label: shortText,
  href: z.union([z.url(), z.string().startsWith("/")]),
});
export type Link = z.infer<typeof link>;
