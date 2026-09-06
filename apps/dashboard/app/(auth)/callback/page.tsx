import { Button } from "@plinth/ui/components/button";
import { Link2Off } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

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
    <AuthShell>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-lg">
          <Link2Off className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in link problem</h1>
        <p className="text-muted-foreground text-sm">
          {error
            ? `That link could not be used (${error}). Links expire shortly and work once — request a fresh one.`
            : "That sign-in link is no longer valid. Links expire shortly and work once — request a fresh one."}
        </p>
        <Button asChild className="mt-2 w-fit">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
