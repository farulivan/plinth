import { err, ERROR_STATUS } from "@plinth/schema/api";
import type { Redis } from "@upstash/redis";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../context";
import { redis } from "../lib/redis";

/**
 * Fixed-window counter against Upstash Redis (ADR-0003 publish cap, ADR-0006
 * upload cap — both specify "an Upstash Redis counter" and this same 429 +
 * Retry-After shape). Exported separately from the middleware so tests can
 * drive it against a fake Redis without booting Hono.
 */
export async function checkRateLimit(
  client: Pick<Redis, "incr" | "expire">,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const windowKey = `ratelimit:${key}:${windowStart}`;

  const count = await client.incr(windowKey);
  if (count === 1) {
    // First hit in this window opens the TTL; a crash between incr and expire
    // just leaves the key alive a little past its window, which only ever
    // makes the limit stricter, never looser.
    await client.expire(windowKey, windowSeconds);
  }

  if (count <= limit) return { allowed: true };
  const retryAfterSeconds = windowStart + windowSeconds - Math.floor(Date.now() / 1000);
  return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
}

/**
 * Per-workspace rate cap on one route. Mount on the specific `.post(...)`
 * handler, not the whole module — reads (status, versions, library listing)
 * are uncapped. A request with no active workspace passes through; the
 * handler itself already 401s that case.
 */
export function rateLimit(action: string, limit: number, windowSeconds: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const workspaceId = c.get("workspaceId");
    if (!workspaceId) return next();

    // Fail open on Redis errors: abuse prevention is not worth turning an
    // Upstash blip into a hard outage for every publish/upload in flight.
    let result: Awaited<ReturnType<typeof checkRateLimit>>;
    try {
      result = await checkRateLimit(redis, `${action}:${workspaceId}`, limit, windowSeconds);
    } catch (error) {
      console.error(`[rateLimit] Redis unavailable, allowing ${action} through:`, error);
      return next();
    }

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      return c.json(
        err("rate_limited", `Too many ${action} requests — try again in ${minutes} min.`),
        { status: ERROR_STATUS.rate_limited },
      );
    }
    await next();
  });
}
