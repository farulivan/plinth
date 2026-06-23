import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship as TS source, so Next must transpile them.
  transpilePackages: ["@plinth/ui", "@plinth/schema"],
};

export default nextConfig;
