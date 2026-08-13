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

/**
 * A client that goes away mid-response, which is not an error.
 *
 * The media proxy and the preview's SSE stream both hand Next a body that is
 * still being read when the browser cancels — navigating away, a `<picture>`
 * switching source, an iframe reloading, a phone losing signal. Next surfaces
 * that as an unhandled `ResponseAborted`, and reporting it buries the errors
 * that are real: a single reloading preview can abort a multi-megabyte image
 * variant on every pass.
 *
 * Matched by name rather than by route, because any streaming response can
 * end this way and a route list would go stale.
 */
function isClientDisconnect(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "ResponseAborted" || name === "AbortError";
}

// Captures errors thrown in Server Components, route handlers, and Server Actions.
export const onRequestError: typeof Sentry.captureRequestError = (error, request, context) => {
  if (isClientDisconnect(error)) return;
  return Sentry.captureRequestError(error, request, context);
};
