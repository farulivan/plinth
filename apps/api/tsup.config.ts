import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries: instrument preloads Sentry (via node --import) before server.ts
  // pulls in the app, so they must stay separate, standalone output files.
  entry: ["src/server.ts", "src/instrument.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  // Workspace packages ship as TS source (never published) → bundle them in.
  // Everything else in node_modules stays external and installs in the runtime
  // image: @sentry's OpenTelemetry, pg, and better-auth all misbehave when
  // bundled, so the api declares them as direct deps for runtime resolution.
  noExternal: [/^@plinth\//],
});
