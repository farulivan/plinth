import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship as TS source, so Next must transpile them.
  transpilePackages: ["@plinth/api", "@plinth/auth", "@plinth/db", "@plinth/schema", "@plinth/ui"],
};

export default nextConfig;
