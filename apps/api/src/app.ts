import { createAuth } from "@plinth/auth";
import { sessionMiddleware } from "@plinth/auth/middleware/hono";
import { createDb } from "@plinth/db";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { type AppBindings, dbContext } from "./context";
import { env } from "./lib/env";
import { internalHmac } from "./middleware/internalHmac";
import { domainsRoutes } from "./modules/domains/routes";
import { mediaRoutes } from "./modules/media/routes";
import { publishRoutes } from "./modules/publish/routes";

// Shared singletons. createDb builds a lazy pg pool (no connection until the
// first query); createAuth constructs the Better Auth instance. Neither touches
// the network at boot, so the app starts without a reachable database.
const { db } = createDb({ connectionString: env.DATABASE_URL });
const auth = createAuth({ db, baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET });

const base = new Hono<AppBindings>();
base.use(sentry(base));

/**
 * Root RPC app. `/health` is registered before the guard chain so the liveness
 * probe stays public and dependency-free (no HMAC, no session, no db). Every
 * module route then runs behind internalHmac (the dashboard-trust boundary,
 * ADR-0008), then session + db context. `AppType` is what the dashboard's Hono
 * RPC client infers from.
 */
export const app = base
  .get("/health", (c) => c.json({ status: "ok" }))
  .use(internalHmac(env.INTERNAL_API_HMAC_SECRET))
  .use(sessionMiddleware(auth))
  .use(dbContext(db))
  .route("/media", mediaRoutes)
  .route("/publish", publishRoutes)
  .route("/domains", domainsRoutes);

export type AppType = typeof app;
