import Link from "next/link";

/** Dashboard home. The editor lands here with the vertical slice; until then
 * it orients: you're signed in, here's what exists. */
export default function DashboardHome() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The editor arrives with the vertical slice. The{" "}
        <Link href="/media" className="underline">
          media library
        </Link>{" "}
        already round-trips the api if you want to see the plumbing move.
      </p>
    </main>
  );
}
