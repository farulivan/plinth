import { createHmac, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

const TIMESTAMP_HEADER = "x-plinth-timestamp";
const SIGNATURE_HEADER = "x-plinth-signature";
/** Replay window: a signed request is only valid for ±5 min. */
const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * Verifies the HMAC envelope on internal routes (dashboard → api, ADR-0008). The
 * dashboard signs `${timestamp}.${method}.${path}.${body}` with the shared
 * INTERNAL_API_HMAC_SECRET; this recomputes it and constant-time compares. A
 * fresh timestamp blocks replay. These routes never face the public internet —
 * the signature is the dashboard-trust boundary, layered under the user session.
 *
 * External inbound webhooks (Inngest, Cloudflare, Stripe) carry their own vendor
 * signatures and must mount OUTSIDE this guard, not under a module group.
 */
export function internalHmac(secret: string) {
  return createMiddleware(async (c, next) => {
    const timestamp = c.req.header(TIMESTAMP_HEADER);
    const signature = c.req.header(SIGNATURE_HEADER);
    if (!timestamp || !signature) {
      throw new HTTPException(401, { message: "Missing internal auth headers" });
    }

    const skew = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(skew) || skew > MAX_SKEW_MS) {
      throw new HTTPException(401, { message: "Stale or invalid timestamp" });
    }

    // Hono caches the body, so a downstream c.req.json()/text() still works.
    const body = await c.req.text();
    const expected = sign(secret, timestamp, c.req.method, new URL(c.req.url).pathname, body);
    if (!safeEqualHex(signature, expected)) {
      throw new HTTPException(401, { message: "Invalid signature" });
    }

    await next();
  });
}

/**
 * Canonical signing string → hex HMAC-SHA256. Exported so the dashboard's RPC
 * client (Branch 10) signs with the exact same construction.
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

/** Constant-time hex compare; length-guarded so timingSafeEqual never throws. */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
