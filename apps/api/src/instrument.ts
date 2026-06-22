import * as Sentry from "@sentry/hono/node";

/**
 * Sentry bootstrap, preloaded before the app (dev: tsx `--import`; prod: node
 * `--import`, Branch 9.6) so the SDK can instrument libraries before they load.
 *
 * Reads raw process.env — this runs before the Zod env contract (lib/env.ts).
 * An absent SENTRY_DSN_API makes init a no-op, the intended dev/local behavior;
 * production sets the DSN via Fly.io secrets.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN_API,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.01,
});
