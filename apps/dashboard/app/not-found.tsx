import Link from "next/link";

/**
 * Branded 404. Rendered per request for the same reason as the sign-in route
 * (ADR-0011): the proxy matches this path and sends a nonce-bearing CSP, and a
 * prerendered document cannot carry the nonce its own bootstrap scripts need.
 * Prerendering it would leave the page visible but unhydrated — the header link
 * below would still work, but every navigation off it would be a full reload.
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground text-sm">
        That page does not exist, or you no longer have access to it.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to the dashboard
      </Link>
    </main>
  );
}
