import { LoginForm } from "@/components/auth/login-form";

/**
 * Sign-in route. Rendered per request rather than prerendered so the proxy's
 * per-request CSP nonce reaches the document (ADR-0011): the page is otherwise
 * built once at compile time, and its inline bootstrap scripts would ship
 * without a nonce the default-deny policy could accept — which on a page whose
 * form is entirely client-side means no sign-in at all.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
