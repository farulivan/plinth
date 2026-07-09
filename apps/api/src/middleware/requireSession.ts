import { err, ERROR_STATUS } from "@plinth/schema/api";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../context";

/**
 * Rejects sessionless requests with the shared envelope. Module routes sit
 * behind internalHmac (proves the dashboard sent it) AND this (proves a user
 * is signed in) — the HMAC authenticates the caller service, the session
 * authenticates the person (ADR-0008/0005). Routes that must serve anonymous
 * traffic (health, future webhooks) mount outside the guard chain.
 */
export function requireSession() {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!c.get("session")) {
      return c.json(err("unauthorized", "A signed-in session is required."), {
        status: ERROR_STATUS.unauthorized,
      });
    }
    await next();
  });
}
