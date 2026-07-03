import { timingSafeEqual } from "node:crypto";
import { MAX_SKEW_MS, SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "@plinth/internal-rpc";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

/**
 * Verifies the HMAC envelope on internal routes (dashboard → api, ADR-0008). The
 * dashboard signs the canonical string (see @plinth/internal-rpc) with
 * INTERNAL_API_HMAC_SECRET; this recomputes it and constant-time compares. A
 * fresh timestamp bounds replay to the skew window. These routes never face the
 * public internet — the signature is the dashboard-trust boundary, layered
 * under the user session.
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
    const url = new URL(c.req.url);
    const expected = sign(secret, timestamp, c.req.method, url.pathname + url.search, body);
    if (!safeEqualHex(signature, expected)) {
      throw new HTTPException(401, { message: "Invalid signature" });
    }

    await next();
  });
}

/** Constant-time hex compare; length-guarded so timingSafeEqual never throws. */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
