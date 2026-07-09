import { api } from "@/lib/api-client";

// Rendered per-request, not prerendered — the api isn't reachable at build. The
// list below is typed purely by inference from the api's route through the Hono
// RPC client: rename `mediaItem.filename` in @plinth/schema and this page stops
// compiling, proving the contract reaches the dashboard end-to-end (no shared
// import of the type — it flows through `hc<AppType>`).
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const res = await api.media.$get();
  // Guard middleware (requireSession) answers outside the typed route union,
  // so non-2xx is checked at the transport level; the typed envelope below
  // covers the route's own arms.
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-muted-foreground mt-4 text-sm">
          Couldn’t load media (status {res.status}). Sign out and back in, then retry.
        </p>
      </main>
    );
  }
  const { data: items } = await res.json();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Media</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">No media yet.</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              {item.filename}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
