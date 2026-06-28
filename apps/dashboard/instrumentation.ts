import * as Sentry from "@sentry/nextjs";

// Next runs register() once per server runtime; load the matching Sentry init.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, route handlers, and Server Actions.
export const onRequestError = Sentry.captureRequestError;
