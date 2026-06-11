import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Testcontainers pulls a Postgres image on first run; generous timeouts.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
