import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker — Next copies a minimal traced
  // node_modules so the runtime image stays small.
  output: "standalone",
  // Trace from the monorepo root so workspace deps land in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Workspace packages ship as TS source, so Next must transpile the ones the
  // dashboard imports at runtime. @plinth/api is deliberately absent: only
  // `import type { AppType }` crosses that boundary, and type imports are
  // erased before bundling.
  transpilePackages: [
    "@plinth/auth",
    "@plinth/db",
    "@plinth/internal-rpc",
    "@plinth/schema",
    "@plinth/ui",
  ],
};

export default withSentryConfig(nextConfig, {
  org: "farul-ivan",
  project: "javascript-nextjs",
  // Source-map upload runs only when SENTRY_AUTH_TOKEN is present (CI/prod);
  // absent locally, so dev builds skip it.
});
