import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { internalHmac, sign } from "./internalHmac";

const SECRET = "test-hmac-secret-value";
const PATH = "/guarded/echo";

function appWithGuard() {
  const app = new Hono();
  app.use("/guarded/*", internalHmac(SECRET));
  app.post("/guarded/echo", (c) => c.json({ ok: true }));
  return app;
}

function signedHeaders(
  body: string,
  { secret = SECRET, ts = Date.now().toString() }: { secret?: string; ts?: string } = {},
) {
  return {
    "content-type": "application/json",
    "x-plinth-timestamp": ts,
    "x-plinth-signature": sign(secret, ts, "POST", PATH, body),
  };
}

describe("internalHmac", () => {
  it("passes a correctly signed request through to the handler", async () => {
    const body = JSON.stringify({ hello: "world" });
    const res = await appWithGuard().request(PATH, {
      method: "POST",
      headers: signedHeaders(body),
      body,
    });
    expect(res.status).toBe(200);
  });

  it("rejects a request with no auth headers", async () => {
    const res = await appWithGuard().request(PATH, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("rejects a stale timestamp outside the replay window", async () => {
    const body = "{}";
    const ts = (Date.now() - 10 * 60 * 1000).toString();
    const res = await appWithGuard().request(PATH, {
      method: "POST",
      headers: signedHeaders(body, { ts }),
      body,
    });
    expect(res.status).toBe(401);
  });

  it("rejects a body that does not match the signature", async () => {
    const res = await appWithGuard().request(PATH, {
      method: "POST",
      headers: signedHeaders("{}"),
      body: JSON.stringify({ tampered: true }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const body = "{}";
    const res = await appWithGuard().request(PATH, {
      method: "POST",
      headers: signedHeaders(body, { secret: "wrong-secret" }),
      body,
    });
    expect(res.status).toBe(401);
  });
});
