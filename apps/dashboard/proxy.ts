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
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://browser.sentry-cdn.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.cloudflareimages.com",
    "connect-src 'self' https://*.ingest.sentry.io",
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
