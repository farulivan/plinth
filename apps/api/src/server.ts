import { serve } from "@hono/node-server";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { app } from "./app";
import { env } from "./lib/env";

// Server bootstrap. Sentry's Hono middleware lives here, not in app.ts, so the
// dashboard can import AppType without pulling @sentry/hono. The root app adds
// Sentry as the outermost middleware, then mounts the typed RPC app under it.
const root = new Hono();
root.use(sentry(root));
root.route("/", app);

serve({ fetch: root.fetch, port: env.PORT }, (info) => {
  console.log(`@plinth/api listening on http://localhost:${info.port}`);
});
