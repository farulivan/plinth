// Sentry for the browser; Next loads this on the client. No DSN → no-op. The
// DSN is public by design (write-only ingest key), hence NEXT_PUBLIC_.
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

/**
 * Zod 4 compiles validators with `new Function` for speed. The dashboard's CSP
 * carries no 'unsafe-eval' (ADR-0011), so that compile is blocked: Zod catches
 * it and falls back to the interpreted path, which is why validation still
 * works — but the attempt raises a CSP violation on every load, and the
 * fallback is the slow path anyway. `jitless` skips the attempt outright.
 *
 * Client-only, set here because this is the first client module Next loads.
 * The api keeps the JIT — it validates far more per request and runs under no
 * CSP at all.
 */
z.config({ jitless: true });

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_DASHBOARD,
  tracesSampleRate: 0.01,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
