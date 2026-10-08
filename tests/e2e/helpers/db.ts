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

/** The purpose prefix Better Auth puts on a magic-link verification row. */
const MAGIC_LINK_PREFIX = "magic-link:";

/**
 * The most recently issued magic-link token. Better Auth keeps the plaintext
 * token in `verification.identifier` (storeToken defaults to "plain"), which
 * is the `?token=` value its verify URL carries — so reading it here lets a
 * test "click" the link without an inbox. Single-use: the token is consumed
 * the moment the verify URL is hit.
 *
 * From 1.7.7 the identifier carries a purpose prefix, `magic-link:<token>`, so
 * a row written for one flow can never be redeemed by another — the fix for
 * GHSA-965c-763c-88jm, where an OAuth state value passed as a magic link. The
 * URL still takes the bare token, so the prefix comes off here. Passing the
 * identifier through whole is what a test does wrong without noticing: the
 * verify endpoint looks up `magic-link:magic-link:<token>`, finds nothing, and
 * every spec that signs in lands back on /login with INVALID_TOKEN.
 *
 * Stripping it rather than requiring it keeps this correct on both sides of
 * that upgrade.
 */
export async function latestMagicLinkToken(): Promise<string> {
  const { rows } = await pool.query<{ identifier: string }>(
    "SELECT identifier FROM verification ORDER BY created_at DESC LIMIT 1",
  );
  const identifier = rows[0]?.identifier;
  if (!identifier) {
    throw new Error("no magic-link verification row found — did the sign-in POST land?");
  }
  return identifier.startsWith(MAGIC_LINK_PREFIX)
    ? identifier.slice(MAGIC_LINK_PREFIX.length)
    : identifier;
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}
