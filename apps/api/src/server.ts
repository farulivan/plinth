import { serve } from "@hono/node-server";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { serve as serveInngest } from "inngest/hono";
import { app } from "./app";
import { functions, inngest } from "./inngest";
import { env } from "./lib/env";

// Server bootstrap. Sentry's Hono middleware lives here, not in app.ts, so the
// dashboard can import AppType without pulling @sentry/hono. The root app adds
// Sentry as the outermost middleware, then mounts the typed RPC app under it.
//
// The Inngest endpoint mounts on the root, NOT inside the typed app: it sits
// outside the internalHmac trust boundary because Inngest authenticates with
// its own vendor signature (INNGEST_SIGNING_KEY), exactly the carve-out the
// internalHmac docs anticipate. The compose dev server polls this same path
// (/api/inngest).
const root = new Hono();
root.use(sentry(root));
root.on(["GET", "POST", "PUT"], "/api/inngest", serveInngest({ client: inngest, functions }));
root.route("/", app);

serve({ fetch: root.fetch, port: env.PORT }, (info) => {
  console.log(`@plinth/api listening on http://localhost:${info.port}`);
});
