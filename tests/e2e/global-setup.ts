import { execSync } from "node:child_process";

/**
 * Guarantee the schema and seed data exist before any spec runs, regardless of
 * how the stack came up (a developer's `pnpm dev`, or the CI workflow). Both
 * steps are idempotent — migrate applies only pending files, seed upserts on
 * natural keys — so re-running against an already-prepared database is a
 * no-op, not a conflict.
 */
export default function globalSetup(): void {
  const run = (command: string) => execSync(command, { stdio: "inherit", env: process.env });

  run("pnpm --filter @plinth/db db:migrate");
  run("pnpm seed");
}
