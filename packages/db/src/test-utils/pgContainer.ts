import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

export interface TestDb {
  container: StartedPostgreSqlContainer;
  /** Connects as `app_owner` — a non-superuser that owns the tables. */
  connectionString: string;
  stop: () => Promise<void>;
}

/**
 * Throwaway Postgres for integration tests. The container's default user is
 * a superuser, and superusers bypass RLS unconditionally — probing as it
 * would prove nothing. So this creates `app_owner`: LOGIN, non-superuser,
 * runs the migrations and therefore owns every table. That mirrors the Neon
 * posture exactly (one role migrates and serves traffic), and it is the case
 * FORCE ROW LEVEL SECURITY exists for — owners are exempt from RLS without
 * it, so the probe doubles as a regression test on FORCE.
 */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();

  const admin = new Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  await admin.query(`CREATE ROLE app_owner LOGIN PASSWORD 'app_owner'`);
  // CREATE on the database (drizzle's migrator makes its own schema) + on public.
  await admin.query(`GRANT ALL ON DATABASE "${container.getDatabase()}" TO app_owner`);
  await admin.query(`GRANT ALL ON SCHEMA public TO app_owner`);
  await admin.end();

  const connectionString = `postgresql://app_owner:app_owner@${container.getHost()}:${container.getMappedPort(
    5432,
  )}/${container.getDatabase()}`;

  return { container, connectionString, stop: () => container.stop().then(() => undefined) };
}
