// Sentry for the Node.js server runtime; instrumentation.ts loads this. No DSN
// (dev / unset) → the SDK no-ops, so it is safe to always run.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_DASHBOARD,
  tracesSampleRate: 0.01,
});
