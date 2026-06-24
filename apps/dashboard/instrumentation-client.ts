// Sentry for the browser; Next loads this on the client. No DSN → no-op. The
// DSN is public by design (write-only ingest key), hence NEXT_PUBLIC_.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_DASHBOARD,
  tracesSampleRate: 0.01,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
