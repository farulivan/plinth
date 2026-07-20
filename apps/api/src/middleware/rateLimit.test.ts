import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppBindings } from "../context";

// checkRateLimit is a pure function; stub the shared client so importing this
// module doesn't eagerly parse the real env (redis.ts constructs its client
// from env at import time, same reasoning as the adapter mocks in service.test.ts).
const redisMock = { incr: vi.fn(), expire: vi.fn() };
vi.mock("../lib/redis", () => ({ redis: redisMock }));
const { checkRateLimit, rateLimit } = await import("./rateLimit");

describe("checkRateLimit", () => {
  it("allows requests under the limit and sets a TTL only on the first hit", async () => {
    const client = { incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) };

    const result = await checkRateLimit(client, "publish:ws-1", 20, 3600);

    expect(result).toEqual({ allowed: true });
    expect(client.expire).toHaveBeenCalledWith(expect.stringContaining("publish:ws-1"), 3600);
  });

  it("does not re-set the TTL on subsequent hits in the same window", async () => {
    const client = { incr: vi.fn().mockResolvedValue(5), expire: vi.fn() };

    const result = await checkRateLimit(client, "publish:ws-1", 20, 3600);

    expect(result).toEqual({ allowed: true });
    expect(client.expire).not.toHaveBeenCalled();
  });

  it("rejects once the count exceeds the limit, with a positive retry-after", async () => {
    const client = { incr: vi.fn().mockResolvedValue(21), expire: vi.fn() };

    const result = await checkRateLimit(client, "publish:ws-1", 20, 3600);

    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("rateLimit middleware", () => {
  const app = () =>
    new Hono<AppBindings>()
      .use(async (c, next) => {
        c.set("workspaceId", "ws-1");
        await next();
      })
      .get("/", rateLimit("publish", 1, 3600), (c) => c.json({ ok: true }));

  it("passes requests through when Redis is unreachable (fail open)", async () => {
    redisMock.incr.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await app().request("/");

    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    redisMock.incr.mockResolvedValueOnce(2);

    const res = await app().request("/");

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});
