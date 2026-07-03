import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./src/migrations",
  // TS fields stay camelCase; columns land snake_case without per-column names.
  casing: "snake_case",
  dbCredentials: {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- CLI-only config, not app runtime
    url: process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth",
  },
});
