import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withWorkspace, type Db } from "./client";
import { allRlsStatements } from "./rls";
import { contentDrafts, workspaces } from "./schema";
import { startTestDb, type TestDb } from "./test-utils/pgContainer";

/**
 * ADR-0002's ship-blocker probe: authenticated as workspace A, ask for
 * workspace B's rows by hard-coded id and assert empty — against a real
 * Postgres, as a non-superuser table owner (see pgContainer.ts).
 */
describe("cross-tenant RLS probe", () => {
  let testDb: TestDb;
  let db: Db;
  let pool: Pool;
  let wsA: string;
  let wsB: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    ({ db, pool } = createDb({ connectionString: testDb.connectionString, max: 5 }));
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    });

    // workspaces is deliberately not RLS-scoped (it is the GUC's target).
    const [a, b] = await db
      .insert(workspaces)
      .values([
        { slug: "tenant-a", name: "Tenant A" },
        { slug: "tenant-b", name: "Tenant B" },
      ])
      .returning({ id: workspaces.id });
    wsA = a!.id;
    wsB = b!.id;

    for (const ws of [wsA, wsB]) {
      await withWorkspace(db, ws, (tx) =>
        tx.insert(contentDrafts).values({
          workspaceId: ws,
          document: { schemaVersion: 1, sections: [] },
        }),
      );
    }
  });

  afterAll(async () => {
    await pool.end();
    await testDb.stop();
  });

  it("tenant A cannot read tenant B's rows, even by hard-coded id", async () => {
    const leaked = await withWorkspace(db, wsA, (tx) =>
      tx.select().from(contentDrafts).where(eq(contentDrafts.workspaceId, wsB)),
    );
    expect(leaked).toHaveLength(0);
  });

  it("tenant A reads its own rows through the same path", async () => {
    const own = await withWorkspace(db, wsA, (tx) => tx.select().from(contentDrafts));
    expect(own).toHaveLength(1);
    expect(own[0]!.workspaceId).toBe(wsA);
  });

  it("queries outside withWorkspace see nothing (fail-closed on unset GUC)", async () => {
    const rows = await db.select().from(contentDrafts);
    expect(rows).toHaveLength(0);
  });

  it("tenant A cannot insert a row owned by tenant B (WITH CHECK)", async () => {
    // Drizzle wraps the pg error; the RLS violation is the cause.
    await expect(
      withWorkspace(db, wsA, (tx) =>
        tx.insert(contentDrafts).values({
          workspaceId: wsB,
          document: { schemaVersion: 1, sections: [] },
        }),
      ),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringMatching(/row-level security/) as unknown,
      }) as unknown,
    });
  });

  it("the GUC does not leak across transactions on a pooled connection", async () => {
    await withWorkspace(db, wsA, (tx) => tx.select().from(contentDrafts));
    const after = await db.select().from(contentDrafts);
    expect(after).toHaveLength(0);
  });
});

describe("migration drift guard", () => {
  it("0001_rls.sql contains every statement rls.ts emits", () => {
    const migrationSql = readFileSync(
      fileURLToPath(new URL("./migrations/0001_rls.sql", import.meta.url)),
      "utf8",
    );
    for (const statement of allRlsStatements()) {
      expect(migrationSql).toContain(statement);
    }
  });
});
