/* eslint-disable turbo/no-undeclared-env-vars -- one-shot CI script, not app runtime */
import { Client } from "pg";

/**
 * Prove the database is reachable, and say precisely how it is not.
 *
 * This exists because `drizzle-kit migrate` renders a spinner and exits 1 with
 * no message. A failed deploy therefore reports "applying migrations..." and
 * nothing else, and the operator cannot tell a refused connection from a bad
 * password from a genuinely broken migration — three problems with three
 * different responses, none of which is "read the SQL again".
 *
 * Runs before the migration rather than replacing it: everything here is a
 * read, so a preflight that passes and a migration that then fails narrows the
 * fault to the SQL, which is exactly the split that was missing.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[preflight] DATABASE_URL is unset.");
  process.exit(1);
}

// Parsed for reporting only. The password is never read, and the host is
// printed so a run against the wrong database is visible in the log rather
// than inferred later from what changed.
let host = "unknown";
let database = "unknown";
let sslMode: string | null = null;
try {
  const parsed = new URL(url);
  host = parsed.host;
  database = parsed.pathname.replace(/^\//, "") || "(default)";
  sslMode = parsed.searchParams.get("sslmode");
} catch {
  console.error("[preflight] DATABASE_URL is not a valid URL.");
  process.exit(1);
}

console.log(`[preflight] host=${host} database=${database} sslmode=${sslMode ?? "(unset)"}`);

/**
 * `require` and `prefer` are now aliases for `verify-full` in this driver, so
 * a URL carrying either asks for full certificate and hostname verification
 * whether or not its author meant to. That is the stricter, better default —
 * but it turns a certificate the runner cannot chain into a connection error
 * that mentions neither certificates nor SSL, so name it up front.
 */
if (sslMode && ["require", "prefer", "verify-ca"].includes(sslMode)) {
  console.log(
    `[preflight] note: sslmode=${sslMode} is treated as verify-full by this driver; ` +
      "a TLS failure below is a certificate or hostname problem, not a credentials one.",
  );
}

const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
const started = Date.now();

try {
  await client.connect();
  const { rows } = await client.query<{ version: string; applied: number }>(
    `select version() as version,
            (select count(*)::int from information_schema.tables
              where table_schema = 'drizzle') as applied`,
  );
  const row = rows[0];
  console.log(`[preflight] connected in ${Date.now() - started} ms`);
  console.log(`[preflight] server: ${row?.version.split(",")[0] ?? "unknown"}`);
  console.log(
    row?.applied
      ? "[preflight] drizzle metadata present — this database has been migrated before."
      : "[preflight] no drizzle metadata — this looks like a first migration.",
  );
} catch (error) {
  const err = error as NodeJS.ErrnoException & { code?: string; severity?: string };
  console.error(`[preflight] FAILED after ${Date.now() - started} ms`);
  console.error(`[preflight] ${err.name}: ${err.message}`);
  if (err.code) console.error(`[preflight] code: ${err.code}`);
  // The three that actually happen, each with the response it calls for.
  const hint: Record<string, string> = {
    ENOTFOUND: "hostname does not resolve — check the host in DATABASE_URL.",
    ECONNREFUSED: "nothing is listening — the database may be suspended or firewalled.",
    ETIMEDOUT: "no response — check network egress, or a compute that will not wake.",
    CERT_HAS_EXPIRED: "server certificate has expired.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "certificate chain cannot be verified from this runner.",
    SELF_SIGNED_CERT_IN_CHAIN: "certificate chain is self-signed.",
    "28P01": "password authentication failed — the credential is wrong or rotated.",
    "3D000": "that database does not exist on this server.",
    "53300": "too many connections — the server is at its limit.",
  };
  if (err.code && hint[err.code]) console.error(`[preflight] likely: ${hint[err.code]}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
