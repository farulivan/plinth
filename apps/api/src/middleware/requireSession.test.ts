import type { AppSession } from "@plinth/schema/auth";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppBindings } from "../context";
import { requireSession } from "./requireSession";

const SESSION: AppSession = {
  sessionId: "0d4b7a68-3a68-4f2e-9dc5-8f4f6a2f9c11",
  user: { id: "7f9b1d2a-52c4-4a4e-8f27-3f4e5d6c7b81", email: "user@plinth.test", name: null },
  activeWorkspaceId: null,
};

function appWith(session: AppSession | null) {
  return new Hono<AppBindings>()
    .use(async (c, next) => {
      c.set("session", session);
      await next();
    })
    .use(requireSession())
    .get("/echo", (c) => c.json({ reached: true }));
}

describe("requireSession", () => {
  it("rejects a sessionless request with the 401 envelope", async () => {
    const res = await appWith(null).request("/echo");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("unauthorized");
  });

  it("passes a request that carries a session", async () => {
    const res = await appWith(SESSION).request("/echo");
    expect(res.status).toBe(200);
  });
});
