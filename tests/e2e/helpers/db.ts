import { Pool } from "pg";

/**
 * A throwaway pool for the few reads the e2e helpers need against the dev
 * database — the magic-link token intercept, chiefly. Kept out of the specs
 * so they never import a DB driver directly.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth",
  max: 2,
  // Let idle clients release so the Playwright worker process exits without an
  // explicit teardown call.
  allowExitOnIdle: true,
});

/**
 * The most recently issued magic-link token. Better Auth stores the plaintext
 * token as `verification.identifier` (storeToken defaults to "plain"), which
 * is exactly the `?token=` value its verify URL carries — so reading it here
 * lets a test "click" the link without an inbox. Single-use: the token is
 * consumed the moment the verify URL is hit.
 */
export async function latestMagicLinkToken(): Promise<string> {
  const { rows } = await pool.query<{ identifier: string }>(
    "SELECT identifier FROM verification ORDER BY created_at DESC LIMIT 1",
  );
  const token = rows[0]?.identifier;
  if (!token) throw new Error("no magic-link verification row found — did the sign-in POST land?");
  return token;
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}
