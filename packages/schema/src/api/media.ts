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
  createdAt: z.iso.datetime(),
});

export type MediaItem = z.infer<typeof mediaItem>;

/** The widths every upload is rendered at (ADR-0006 — Norven's grid). */
export const MEDIA_VARIANT_WIDTHS = [400, 800, 1200, 1600] as const;
/** The formats every upload is rendered in, best-first. */
export const MEDIA_VARIANT_FORMATS = ["avif", "webp", "jpeg"] as const;
export type MediaVariantFormat = (typeof MEDIA_VARIANT_FORMATS)[number];

/** Upload ceiling (ADR-0006). */
export const MEDIA_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Per-workspace storage cap — free tier (paid tiers arrive with billing). */
export const MEDIA_STORAGE_CAP_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * The variant widths that actually exist for an original of a given width:
 * upscaling is never done, so widths beyond the original are skipped; a tiny
 * original still gets one variant (stored under the smallest width's name).
 * The upload pipeline emits exactly this set and the renderer derives its
 * srcset from the same rule — one function, no drift.
 */
export function mediaVariantWidths(originalWidth: number): number[] {
  const fit = MEDIA_VARIANT_WIDTHS.filter((width) => width <= originalWidth);
  return fit.length > 0 ? [...fit] : [MEDIA_VARIANT_WIDTHS[0]];
}
