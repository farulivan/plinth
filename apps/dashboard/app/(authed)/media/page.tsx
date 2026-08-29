import { MediaLibrary } from "@/components/media/media-library";
import { api } from "@/lib/api-client";

// Rendered per-request, not prerendered — the api isn't reachable at build.
export const dynamic = "force-dynamic";

/** The workspace media library (ADR-0006): the shell fetches, the client
 * component owns the grid, filters, and upload queue. Thumbnails ride the
 * same-origin /_media proxy. Alt text is absent on purpose — it belongs to
 * the fields that reference an image. */
export default async function MediaPage() {
  const res = await api.media.$get();
  if (!res.ok) {
    return (
      <main className="p-6">
        <p className="text-muted-foreground text-sm">
          Couldn’t load media (status {res.status}). Sign out and back in, then retry.
        </p>
      </main>
    );
  }
  // Transport-level failures returned above; a 200 is always the ok envelope
  // (the union's err arms ride non-2xx statuses, which hc's typing encodes).
  const { data: items } = await res.json();

  return (
    <main className="p-6">
      <MediaLibrary items={items} />
    </main>
  );
}
