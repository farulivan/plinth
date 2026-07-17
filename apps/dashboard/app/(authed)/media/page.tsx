import { MediaUpload } from "@/components/media/media-upload";
import { api } from "@/lib/api-client";

// Rendered per-request, not prerendered — the api isn't reachable at build.
export const dynamic = "force-dynamic";

/** The workspace media library (ADR-0006): every upload, its dimensions and
 * weight; thumbnails ride the same-origin /_media proxy. Alt text is absent
 * on purpose — it belongs to the fields that reference an image. */
export default async function MediaPage() {
  const res = await api.media.$get();
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          Couldn’t load media (status {res.status}). Sign out and back in, then retry.
        </p>
      </main>
    );
  }
  // Transport-level failures returned above; a 200 is always the ok envelope
  // (the union's err arms ride non-2xx statuses, which hc's typing encodes).
  const { data: items } = await res.json();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Media</h1>
      <MediaUpload />
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No media yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} className="space-y-1">
              {/* Plain img: the proxy serves sized, immutable variants. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/_media/${item.contentHash}/w400.webp`}
                alt=""
                loading="lazy"
                className="aspect-square w-full rounded-lg border object-cover"
              />
              <p className="text-muted-foreground text-xs">
                {item.width}×{item.height} · {Math.max(1, Math.round(item.fileSize / 1024))} KB
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
