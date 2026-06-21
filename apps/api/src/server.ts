import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./lib/env";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@plinth/api listening on http://localhost:${info.port}`);
});
