"use server";

import { err, type Envelope, type MediaItem } from "@plinth/schema/api";
import { api } from "@/lib/api-client";

/**
 * Media library listing for the picker and the library page. Uploads go
 * through the /api/media/upload route handler (files don't belong in the
 * action transport); this action only reads. Never throws — the saveDraft
 * convention.
 */
export async function listMedia(): Promise<Envelope<MediaItem[]>> {
  try {
    const response = await api.media.$get();
    return (await response.json()) as Envelope<MediaItem[]>;
  } catch (error) {
    console.error("[listMedia] transport failure:", error);
    return err("internal", "Could not reach the media service.");
  }
}
