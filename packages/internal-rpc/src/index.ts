import { createHmac } from "node:crypto";

/** Header carrying the request timestamp (ms epoch) of the HMAC envelope. */
export const TIMESTAMP_HEADER = "x-plinth-timestamp";
/** Header carrying the hex HMAC-SHA256 signature. */
export const SIGNATURE_HEADER = "x-plinth-signature";
/** Replay window: a signed request is only valid for ±5 min. */
export const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * The dashboard→api HMAC envelope (ADR-0008): canonical string → hex
 * HMAC-SHA256. Single source of truth shared by the dashboard's RPC client
 * (which signs) and the api's internalHmac middleware (which verifies), so the
 * two can't drift. Lives in its own package so neither app imports the other
 * at runtime — only `import type { AppType }` crosses that boundary.
 *
 * Canonical string: `timestamp\nmethod\npath+search\nbody`. The query string
 * is signed so a captured request can't be replayed with different params.
 * Newline is the delimiter because it cannot occur in the first three fields
 * (the timestamp is numeric-validated, the method is an HTTP token, URL
 * serialization percent-encodes raw newlines) and the body comes last — so no
 * (path, body) re-slicing can produce a colliding message. Pure node:crypto,
 * no framework deps.
 */
export function sign(
  secret: string,
  timestamp: string,
  method: string,
  pathWithSearch: string,
  body: string,
): string {
  const message = `${timestamp}\n${method}\n${pathWithSearch}\n${body}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}
