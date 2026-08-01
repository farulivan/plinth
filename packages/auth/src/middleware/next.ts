import { type NextRequest, NextResponse } from "next/server";

/** Better Auth's default session cookie. Override if `advanced.cookiePrefix`
 * is set in the auth config. Over HTTPS, Better Auth prefixes the cookie with
 * `__Secure-`, so the gate must accept either name (see hasSessionCookie). */
const DEFAULT_SESSION_COOKIE = "better-auth.session_token";

export interface AuthGateOptions {
  /** Path to send unauthenticated requests to. */
  loginPath?: string;
  /** Path prefixes that require a session; others pass through. */
  protectedPaths?: string[];
  /**
   * Path prefixes that must never be redirected, checked before
   * `protectedPaths`. This exists so the unauthenticated auth pages can stay
   * *inside* the proxy's matcher — the alternative, excluding them from the
   * matcher to dodge a redirect loop, also excludes them from every response
   * header the proxy sets, which left the sign-in page as the only surface on
   * the dashboard shipping no CSP at all.
   */
  publicPaths?: string[];
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
    publicPaths = [],
    sessionCookie = DEFAULT_SESSION_COOKIE,
  } = options;

  /**
   * Prefix match on path segments, so `/media` matches the prefix `/media` but
   * `/media-library` does not. `"/"` is special-cased to match everything:
   * naive `startsWith(prefix + "/")` turns it into `startsWith("//")`, which is
   * false for every real path, so the dashboard's `protectedPaths: ["/"]` was
   * gating the root and nothing below it.
   */
  const matches = (pathname: string, prefixes: string[]) =>
    prefixes.some((prefix) =>
      prefix === "/" ? true : pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  /**
   * `forwardHeaders`, when given, is threaded into every pass-through
   * response as `NextResponse.next({ request: { headers } })` — the one way
   * a proxy can hand a per-request value (e.g. a CSP nonce) to the Server
   * Components that render this same request. Redirects don't render
   * anything, so they don't need it.
   */
  return function authGate(request: NextRequest, forwardHeaders?: Headers): NextResponse {
    const { pathname } = request.nextUrl;
    const next = () =>
      forwardHeaders
        ? NextResponse.next({ request: { headers: forwardHeaders } })
        : NextResponse.next();

    // Public first: with `protectedPaths: ["/"]` every path is protected, so
    // the sign-in page would otherwise redirect to itself forever.
    if (matches(pathname, publicPaths)) return next();
    if (!matches(pathname, protectedPaths)) return next();

    if (!hasSessionCookie(request, sessionCookie)) {
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return next();
  };
}

/** True if either the plain cookie or its production `__Secure-`-prefixed
 * variant is present. Better Auth adds the prefix whenever it issues Secure
 * cookies (any HTTPS origin), so a gate hard-coded to the bare name would
 * bounce every authenticated request in production. */
function hasSessionCookie(request: NextRequest, name: string): boolean {
  return request.cookies.has(name) || request.cookies.has(`__Secure-${name}`);
}
