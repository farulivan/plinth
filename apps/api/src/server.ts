import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./lib/env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`@plinth/api listening on http://localhost:${info.port}`);
});
