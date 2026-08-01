import { RETURN_PATH_PARAM, safeReturnPath } from "@plinth/auth/middleware/next";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Sign-in route. Rendered per request rather than prerendered so the proxy's
 * per-request CSP nonce reaches the document (ADR-0011): the page is otherwise
 * built once at compile time, and its inline bootstrap scripts would ship
 * without a nonce the default-deny policy could accept — which on a page whose
 * form is entirely client-side means no sign-in at all.
 *
 * The gate records the path an unauthenticated visitor was reaching for; this
 * reads it back as the post-sign-in destination, through `safeReturnPath`
 * because the value arrives from the query string (ADR-0005).
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params[RETURN_PATH_PARAM];
  return <LoginForm callbackURL={safeReturnPath(Array.isArray(raw) ? raw[0] : raw)} />;
}
