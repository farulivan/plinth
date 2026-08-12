import { z } from "zod";

/**
 * Reference to a media-library row plus context-dependent alt text.
 *
 * Alt lives on the field, not the media row (ADR-0006): the same photo is
 * "Coastal house at dusk" in a hero and "Salt House — west facade" in a
 * gallery caption. The required pairing is the schema-enforced a11y floor
 * (ADR-0001) — a publish cannot pass validation with a missing alt.
 *
 * contentHash/width/height are copied from the media row at pick time
 * (ADR-0014): variants are content-addressed and immutable, so freezing them
 * into the field makes every snapshot self-renderable — the builder and the
 * preview derive `/_media/{contentHash}/w{width}.{format}` URLs without a
 * media-table read, and width/height reserve layout space against CLS.
 */
export const mediaRef = z.object({
  mediaId: z.uuid(),
  alt: z.string().trim().min(1).max(300),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /**
   * Which variant widths exist in R2 for this image, copied from the media row
   * alongside the hash. Self-describing for the same reason the hash is: a
   * snapshot renders from itself. Deriving the srcset from whatever
   * `MEDIA_VARIANT_WIDTHS` says today would break every reference the moment a
   * width is added — see `variantWidthsFor`, which owns the absent case.
   */
  widths: z.array(z.number().int().positive()).min(1).optional(),
});
export type MediaRef = z.infer<typeof mediaRef>;
