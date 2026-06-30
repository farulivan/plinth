import { z } from "zod";

/**
 * A stored media asset as the api's `GET /media` returns it. Deliberately minimal
 * for the foundation's end-to-end verification — the full shape (R2 key, variants,
 * dimensions, alt text) lands with the media pipeline (ADR-0006).
 */
export const mediaItem = z.object({
  id: z.uuid(),
  filename: z.string().min(1),
});

export type MediaItem = z.infer<typeof mediaItem>;
