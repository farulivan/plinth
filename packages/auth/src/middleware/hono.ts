import type { AppSession } from "@plinth/schema/auth";
import { err } from "@plinth/schema/api";
import { createMiddleware } from "hono/factory";
import type { Auth } from "../server";
import { getSession } from "../session";

/** Hono context vars the auth middleware sets. Route handlers read
 * `c.get("session")`; `requireSession` narrows it to non-null. */
export type AuthVariables = { session: AppSession | null };

/**
 * Resolve the session and attach it to the Hono context (api runtime, ADR-0008).
 * Non-blocking: public and private routes share this; gating is `requireSession`.
 * The GUC bridge is applied per-route via `withSessionWorkspace`, not here — a
 * request that never touches tenant data never opens a transaction.
 */
export function sessionMiddleware(auth: Auth) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    c.set("session", await getSession({ auth, headers: c.req.raw.headers }));
    await next();
  });
}

/**
 * Gate a route on an authenticated session, 401ing with the shared error
 * envelope otherwise. Runs `sessionMiddleware`'s resolution itself, so it
 * works whether or not that middleware is mounted upstream.
 */
export function requireSession(auth: Auth) {
  return createMiddleware<{ Variables: { session: AppSession } }>(async (c, next) => {
    const session = await getSession({ auth, headers: c.req.raw.headers });
    if (!session) {
      return c.json(err("unauthorized", "Authentication required."), 401);
    }
    c.set("session", session);
    await next();
  });
}
