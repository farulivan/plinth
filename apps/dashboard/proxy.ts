import { createAuthGate } from "@plinth/auth/middleware/next";
import { type NextResponse, type NextRequest } from "next/server";

// Edge-runtime redirect for the unauthenticated (ADR-0005), via Next 16's proxy
// convention (the renamed middleware). Cookie-presence only — real session
// validation happens in Server Components through getSession, since the proxy
// can't reach Postgres. Not a security boundary; RLS is.
const authGate = createAuthGate({
  loginPath: "/login",
  protectedPaths: ["/"],
  // Inside the matcher (so they carry the CSP), outside the redirect (so they
  // don't bounce to themselves). `/robots.txt` and `/.well-known` are here for
  // a different reason: they are unauthenticated by definition, and with every
  // path protected they would otherwise answer a crawler or a verification
  // probe with the sign-in page instead of the file it asked for.
  publicPaths: ["/login", "/callback", "/robots.txt", "/.well-known"],
});

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
  //
  // No https://browser.sentry-cdn.com: Sentry ships through @sentry/nextjs and
  // is bundled at build time, so the loader CDN is never fetched — the host
  // appeared in no source file and no built chunk, only in this policy. A host
  // allowlist in script-src is the one weakness a nonce-based policy otherwise
  // does not have, so an entry nothing loads is pure attack surface. Lazily
  // loaded Sentry extras (Replay, the feedback widget) would need it back.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}'`;
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
  // Run on app routes only — skip Better Auth's API and Next internals. The
  // auth pages stay in: they used to be excluded to avoid a redirect loop, but
  // that also stripped their CSP, leaving the sign-in page as the one surface
  // here shipping no policy at all. The loop is handled by `publicPaths` above
  // instead, which is the gate's concern rather than the matcher's. The
  // non-CSP headers cover what this pattern skips — see next.config.ts.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
