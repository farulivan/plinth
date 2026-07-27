import { createAuthGate } from "@plinth/auth/middleware/next";
import { type NextResponse, type NextRequest } from "next/server";

// Edge-runtime redirect for the unauthenticated (ADR-0005), via Next 16's proxy
// convention (the renamed middleware). Cookie-presence only — real session
// validation happens in Server Components through getSession, since the proxy
// can't reach Postgres. Not a security boundary; RLS is.
const authGate = createAuthGate({ loginPath: "/login", protectedPaths: ["/"] });

/**
 * Dashboard CSP (ADR-0011): default-deny, per-request nonce for first-party
 * scripts (everything on the dashboard is first-party — no tenant content
 * renders here). Deviates from the ADR's literal `frame-ancestors 'none'` in
 * one respect: the editor frames its own `/preview/[draftId]` route
 * (same-origin, session-scoped per ADR-0007), so `'none'` would break it —
 * `'self'` still blocks every other embedder.
 */
function cspHeader(nonce: string): string {
  // Turbopack/React use eval() for dev-mode HMR and stack reconstruction
  // (never in production builds) — 'unsafe-eval' is scoped to dev only so
  // the production policy stays at the ADR-0011 baseline.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://browser.sentry-cdn.com`
      : `script-src 'self' 'nonce-${nonce}' https://browser.sentry-cdn.com`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.cloudflareimages.com",
    // *.sentry.io, not *.ingest.sentry.io: regional accounts ingest at
    // hosts like o123.ingest.de.sentry.io, which the narrower pattern
    // doesn't match — so the browser would silently block every event.
    "connect-src 'self' https://*.sentry.io",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("x-nonce", nonce);

  const response = authGate(request, forwardHeaders);
  response.headers.set("Content-Security-Policy", cspHeader(nonce));
  return response;
}

export const config = {
  // Run on app routes only — skip Better Auth's API, Next internals, and the
  // unauthenticated auth pages (avoids a redirect loop).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|callback).*)"],
};
