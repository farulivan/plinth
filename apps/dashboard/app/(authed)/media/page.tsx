import { api } from "@/lib/api-client";

// Rendered per-request, not prerendered — the api isn't reachable at build. The
// list below is typed purely by inference from the api's route through the Hono
// RPC client: rename `mediaItem.filename` in @plinth/schema and this page stops
// compiling, proving the contract reaches the dashboard end-to-end (no shared
// import of the type — it flows through `hc<AppType>`).
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const res = await api.media.$get();
  // Module routes speak the shared envelope; this route has no error arm yet,
  // so `ok` narrows to `true` and `data` is the typed payload.
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
