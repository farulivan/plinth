import { serve } from "@hono/node-server";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { env } from "./lib/env";

const app = new Hono();

// Captures unhandled route errors to Sentry (no-op when no DSN). Skips 3xx/4xx.
app.use(sentry(app));

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@plinth/api listening on http://localhost:${info.port}`);
});
