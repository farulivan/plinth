import { z } from "zod";

/**
 * A stored media asset as the api returns it (ADR-0006): the original's
 * metadata. Variants live in R2 at content-addressed paths derived from
 * contentHash — never stored per row. Alt text deliberately absent (it lives
 * on the referencing content field).
 */
export const mediaItem = z.object({
  id: z.uuid(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1),
  /** The variant widths generated for this upload, copied onto a mediaRef at
   * pick time. Absent on rows written before widths were recorded — see
   * `variantWidthsFor`. */
  widths: z.array(z.number().int().positive()).min(1).optional(),
  createdAt: z.iso.datetime(),
});

export type MediaItem = z.infer<typeof mediaItem>;

/**
 * The widths uploads were rendered at before references began recording their
 * own set. **Frozen — never edit this array.** A reference carrying no
 * `widths` was produced under exactly this rule, and these are the only
 * objects that exist for it in R2. Changing the number below would make the
 * renderer ask for variants that were never generated.
 */
export const LEGACY_MEDIA_VARIANT_WIDTHS = [400, 800, 1200, 1600] as const;

/**
 * The widths every new upload is rendered at (ADR-0006).
 *
 * Each width answers to a slot a template actually renders, measured rather
 * than guessed against Lighthouse's 1350 px desktop viewport at DPR 1:
 *
 * - **640** — a two-column card grid. Inside a 1400 px container with side
 *   padding and a gutter, each slot measures 615 px. Without it the browser
 *   reaches past 400 to 800 and wastes 21% of the bytes it decodes.
 * - **1366** — a full-bleed hero, where a `sizes="100vw"` image jumping
 *   1200 → 1600 wastes 22.5%.
 * - **1920** — the commonest desktop resolution, which otherwise upscales
 *   from 1600 — visible on a full-bleed photograph.
 *
 * Adding a width here is safe for published sites and existing references:
 * both are pinned to the set recorded on the reference itself. New uploads
 * get it immediately; older media converges through `reencodeMediaVariants`
 * where the original bytes were retained. That is the property this list was
 * made movable for, and 640 is the first width to use it — one constant and
 * a fixture regeneration, with nothing to coordinate.
 */
export const MEDIA_VARIANT_WIDTHS = [400, 640, 800, 1200, 1366, 1600, 1920] as const;
/** The formats every upload is rendered in, best-first. */
export const MEDIA_VARIANT_FORMATS = ["avif", "webp", "jpeg"] as const;
export type MediaVariantFormat = (typeof MEDIA_VARIANT_FORMATS)[number];

/** Upload ceiling (ADR-0006). */
export const MEDIA_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Per-workspace storage cap — free tier (paid tiers arrive with billing). */
export const MEDIA_STORAGE_CAP_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Upscaling is never done, so widths beyond the original are skipped; a tiny
 * original still gets one variant, stored under the smallest width's name.
 */
function widthsWithin(set: readonly number[], originalWidth: number): number[] {
  const fit = set.filter((width) => width <= originalWidth);
  return fit.length > 0 ? [...fit] : [set[0]!];
}

/**
 * The widths a **new** upload produces. The encoder emits exactly this set and
 * records it on the media row, so what was generated is a stored fact rather
 * than something recomputed later from a constant that has since moved.
 */
export function mediaVariantWidths(originalWidth: number): number[] {
  return widthsWithin(MEDIA_VARIANT_WIDTHS, originalWidth);
}

/** What exists for media uploaded before widths were recorded. */
export function legacyVariantWidths(originalWidth: number): number[] {
  return widthsWithin(LEGACY_MEDIA_VARIANT_WIDTHS, originalWidth);
}

/**
 * The widths that exist in R2 for one image — the renderer's srcset source,
 * and the reason `MEDIA_VARIANT_WIDTHS` can grow without breaking anything.
 *
 * A reference that records its own `widths` is authoritative: those objects
 * were written when it was picked. One that doesn't predates the recording and
 * falls back to the frozen legacy rule. Deriving from today's constant instead
 * would emit `w1920` URLs for every image ever uploaded, and 404 on all of the
 * ones that were encoded before it existed.
 */
export function variantWidthsFor(media: { width: number; widths?: number[] }): number[] {
  return media.widths ?? legacyVariantWidths(media.width);
}
