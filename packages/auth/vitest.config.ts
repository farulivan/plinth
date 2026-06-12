import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests pull a Postgres image on first run.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
