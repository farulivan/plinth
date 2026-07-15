import { createAuth } from "@plinth/auth";
import { sessionMiddleware } from "@plinth/auth/middleware/hono";
import { Hono } from "hono";
import { type AppBindings, dbContext } from "./context";
import { db } from "./lib/db";
import { env } from "./lib/env";
import { internalHmac } from "./middleware/internalHmac";
import { requireSession } from "./middleware/requireSession";
import { domainsRoutes } from "./modules/domains/routes";
import { draftEventsRoutes } from "./modules/draft-events/routes";
import { mediaRoutes } from "./modules/media/routes";
import { publishRoutes } from "./modules/publish/routes";

// Shared singletons. The pool lives in lib/db (the Inngest functions share
// it); createAuth constructs the Better Auth instance. Neither touches the
// network at boot, so the app starts without a reachable database.
const auth = createAuth({ db, baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET });

/**
 * Root RPC app and the single source of `AppType` for the dashboard's Hono RPC
 * client. Deliberately free of server-only concerns — Sentry's Hono middleware
 * and the Node server live in server.ts — so the dashboard can
 * `import type { AppType }` without resolving @sentry/hono or @hono/node-server.
 *
 * `/health` is registered before the guard chain so the liveness probe stays
 * public and dependency-free (no HMAC, no session, no db). Every module route
 * then runs behind internalHmac (the dashboard-trust boundary, ADR-0008), the
 * session resolver + db context, and requireSession — module routes always
 * speak to a signed-in user; anonymous surfaces mount outside the chain.
 */
export const app = new Hono<AppBindings>()
  .get("/health", (c) => c.json({ status: "ok" }))
  .use(internalHmac(env.INTERNAL_API_HMAC_SECRET))
  .use(sessionMiddleware(auth))
  .use(dbContext(db))
  .use(requireSession())
  .route("/media", mediaRoutes)
  .route("/publish", publishRoutes)
  .route("/domains", domainsRoutes)
  .route("/draft-events", draftEventsRoutes);

export type AppType = typeof app;
