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
 * two can't drift. Pure node:crypto — no framework deps — so the dashboard can
 * import it without pulling Hono server code.
 */
export function sign(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  const message = `${timestamp}.${method}.${path}.${body}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}
