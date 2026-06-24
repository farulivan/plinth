import { createAuthGate } from "@plinth/auth/middleware/next";

// Edge-runtime redirect for the unauthenticated (ADR-0005), via Next 16's proxy
// convention (the renamed middleware). Cookie-presence only — real session
// validation happens in Server Components through getSession, since the proxy
// can't reach Postgres. Not a security boundary; RLS is.
export default createAuthGate({ loginPath: "/login", protectedPaths: ["/"] });

export const config = {
  // Run on app routes only — skip Better Auth's API, Next internals, and the
  // unauthenticated auth pages (avoids a redirect loop).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|callback).*)"],
};
