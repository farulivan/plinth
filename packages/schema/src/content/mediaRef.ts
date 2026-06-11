import { z } from "zod";

/**
 * Reference to a media-library row plus context-dependent alt text.
 *
 * Alt lives on the field, not the media row (ADR-0006): the same photo is
 * "Coastal house at dusk" in a hero and "Salt House — west facade" in a
 * gallery caption. The required pairing is the schema-enforced a11y floor
 * (ADR-0001) — a publish cannot pass validation with a missing alt.
 */
export const mediaRef = z.object({
  mediaId: z.uuid(),
  alt: z.string().trim().min(1).max(300),
});
export type MediaRef = z.infer<typeof mediaRef>;
