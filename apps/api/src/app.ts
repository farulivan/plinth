import { createAuth } from "@plinth/auth";
import { sessionMiddleware } from "@plinth/auth/middleware/hono";
import { createDb } from "@plinth/db";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { type AppBindings, dbContext } from "./context";
import { env } from "./lib/env";

// Shared singletons. createDb builds a lazy pg pool (no connection until the
// first query); createAuth constructs the Better Auth instance. Neither touches
// the network at boot, so the app starts without a reachable database.
const { db } = createDb({ connectionString: env.DATABASE_URL });
const auth = createAuth({ db, baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET });

const base = new Hono<AppBindings>();
base.use(sentry(base));

/**
 * Root RPC app. `/health` is registered before the session/db middleware so the
 * liveness probe stays dependency-free (no session lookup, no db). Everything
 * chained after `.use(...)` runs with session + db context. Module routes mount
 * here in 9.4; `AppType` is what the dashboard's Hono RPC client infers from.
 */
export const app = base
  .get("/health", (c) => c.json({ status: "ok" }))
  .use(sessionMiddleware(auth))
  .use(dbContext(db));

export type AppType = typeof app;
