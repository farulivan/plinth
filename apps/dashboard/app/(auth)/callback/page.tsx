import Link from "next/link";

/**
 * Magic-link error landing (the `errorCallbackURL`). Better Auth verifies the
 * token server-side and redirects successes straight to the app; only failures
 * (expired, already-used, malformed) arrive here with an `?error=` code.
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3">
      <h1 className="text-xl font-semibold">Sign-in link problem</h1>
      <p className="text-muted-foreground text-sm">
        {error
          ? `That link could not be used (${error}).`
          : "That sign-in link is no longer valid."}
      </p>
      <Link className="text-sm underline" href="/login">
        Back to sign in
      </Link>
    </main>
  );
}
