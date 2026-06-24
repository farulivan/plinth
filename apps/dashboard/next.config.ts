import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship as TS source, so Next must transpile them.
  transpilePackages: ["@plinth/api", "@plinth/auth", "@plinth/db", "@plinth/schema", "@plinth/ui"],
};

export default withSentryConfig(nextConfig, {
  org: "farul-ivan",
  project: "javascript-nextjs",
  // Source-map upload runs only when SENTRY_AUTH_TOKEN is present (CI/prod);
  // absent locally, so dev builds skip it.
});
