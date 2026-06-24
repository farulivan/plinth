// Sentry for the edge runtime (proxy + edge routes); instrumentation.ts loads
// this. No DSN → no-op.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_DASHBOARD,
  tracesSampleRate: 0.01,
});
