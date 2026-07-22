import { defineConfig, devices } from "@playwright/test";

// The e2e suite drives the real dashboard + api against the compose dev
// services (ADR-0005/0007). Load .env so globalSetup's migrate/seed and the
// magic-link DB lookup have DATABASE_URL — the same file the apps read.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env (fresh CI checkout before the setup step) — the workflow exports
  // the vars into the environment directly instead.
}

const DASHBOARD_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One worker: the suite shares one seeded workspace + draft, so parallel
  // edits would race on the same rows.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  use: {
    baseURL: DASHBOARD_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Playwright owns both apps in CI; locally it reuses a running `pnpm dev`.
  // The apps read their own env from .env via --env-file / the dashboard's
  // symlinked .env, so no env injection here.
  webServer: [
    {
      command: "pnpm --filter @plinth/api dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: "pnpm --filter @plinth/dashboard dev",
      url: DASHBOARD_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
