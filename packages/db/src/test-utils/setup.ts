import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { createDb, type Db } from "../client";
import { startTestDb, type TestDb } from "./pgContainer";

export interface MigratedTestDb extends TestDb {
  db: Db;
  pool: Pool;
}

/**
 * `startTestDb` + a migrated client in one call, for consumers across the
 * workspace (e.g. @plinth/auth) that need a ready database without owning the
 * migration-folder path. `stop()` closes the pool before stopping the
 * container. Migrations run as `app_owner`, so RLS is live and FORCEd.
 */
export async function setupTestDb(): Promise<MigratedTestDb> {
  const base = await startTestDb();
  const { db, pool } = createDb({ connectionString: base.connectionString, max: 5 });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  return {
    ...base,
    db,
    pool,
    stop: async () => {
      await pool.end();
      await base.stop();
    },
  };
}
