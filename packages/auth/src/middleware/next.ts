import { type NextRequest, NextResponse } from "next/server";

/** Better Auth's default session cookie. Override if `advanced.cookiePrefix`
 * is set in the auth config. */
const DEFAULT_SESSION_COOKIE = "better-auth.session_token";

export interface AuthGateOptions {
  /** Path to send unauthenticated requests to. */
  loginPath?: string;
  /** Path prefixes that require a session; others pass through. */
  protectedPaths?: string[];
  sessionCookie?: string;
}

/**
 * Edge-runtime auth gate for the dashboard's `middleware.ts` (ADR-0005/0008).
 * Deliberately only checks for the *presence* of the session cookie — Next
 * middleware runs on the edge and cannot reach Postgres, so real validation
 * (signature, expiry, workspace) happens in Server Components via `getSession`.
 * This is a cheap redirect for the unauthenticated, not a security boundary;
 * the boundary is RLS + server-side session checks behind it.
 */
export function createAuthGate(options: AuthGateOptions = {}) {
  const {
    loginPath = "/login",
    protectedPaths = ["/"],
    sessionCookie = DEFAULT_SESSION_COOKIE,
  } = options;

  /**
   * `forwardHeaders`, when given, is threaded into every pass-through
   * response as `NextResponse.next({ request: { headers } })` — the one way
   * a proxy can hand a per-request value (e.g. a CSP nonce) to the Server
   * Components that render this same request. Redirects don't render
   * anything, so they don't need it.
   */
  return function authGate(request: NextRequest, forwardHeaders?: Headers): NextResponse {
    const { pathname } = request.nextUrl;
    const isProtected = protectedPaths.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    const next = () =>
      forwardHeaders
        ? NextResponse.next({ request: { headers: forwardHeaders } })
        : NextResponse.next();
    if (!isProtected) return next();

    if (!request.cookies.has(sessionCookie)) {
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return next();
  };
}
