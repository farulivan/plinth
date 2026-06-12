import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { WORKSPACE_GUC } from "./rls";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Pool + Drizzle factory. Callers (api, jobs, tests) own the lifecycle —
 * create once at boot, `pool.end()` on shutdown. `max` defaults to 10 per
 * ADR-0011 (Neon transaction pooler budget per machine).
 */
export function createDb(options: { connectionString: string; max?: number }): {
  db: Db;
  pool: Pool;
} {
  const pool = new Pool({ connectionString: options.connectionString, max: options.max ?? 10 });
  // `casing` must match drizzle.config.ts: camelCase TS fields → snake_case columns.
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}

/**
 * The only sanctioned path to tenant data (ADR-0002). Opens a transaction,
 * binds the workspace GUC with `SET LOCAL` semantics, and runs `fn` against
 * the transaction-scoped client — so the GUC dies with the transaction and a
 * pooled connection can never carry a stale tenant into the next request.
 *
 * Uses `set_config(..., true)` instead of literal `SET LOCAL` because it is
 * parameterizable — the workspace id travels as a bind value, never via
 * string interpolation into SQL.
 */
export async function withWorkspace<T>(
  db: Db,
  workspaceId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${WORKSPACE_GUC}, ${workspaceId}, true)`);
    return fn(tx);
  });
}
