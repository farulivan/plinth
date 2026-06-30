import type { MediaItem } from "@plinth/schema/api";

/**
 * Media listing for the active workspace. Returns an empty list until the media
 * pipeline lands (ADR-0006) — it exists now to give `GET /media` a typed response
 * so the dashboard's Hono RPC client infers the shape end-to-end.
 */
export function listMedia(): MediaItem[] {
  return [];
}
