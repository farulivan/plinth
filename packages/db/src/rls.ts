import { getTableName } from "drizzle-orm";
import { auditLogs } from "./schema/auditLogs";
import { contentDrafts } from "./schema/contentDrafts";
import { contentVersions } from "./schema/contentVersions";
import { customDomains } from "./schema/customDomains";
import { media } from "./schema/media";

/**
 * Tenant-isolation policy SQL (ADR-0002).
 *
 * Emitted here instead of drizzle's `pgPolicy()` because drizzle-kit cannot
 * generate `FORCE ROW LEVEL SECURITY`, and FORCE is load-bearing: the app
 * role owns these tables (single-role posture per ADR-0011), and Postgres
 * exempts table owners from RLS unless the table is FORCEd — without it every
 * policy below is decorative. This module is the single authority for that
 * SQL: the initial migration inlines its output, and the cross-tenant probe
 * applies it to a throwaway container.
 *
 * Fail-closed: with the GUC unset, `current_setting(..., true)` returns NULL,
 * the predicate never evaluates true, and every query sees zero rows. The
 * NULLIF matters: once a custom GUC has been set in any transaction, Postgres
 * reverts it to '' (not NULL) at session level — and a bare ''::uuid cast
 * errors instead of returning empty. Caught by the probe's pooled-connection
 * test.
 */

/** Session GUC naming the active tenant. Set via `SET LOCAL` inside a
 * per-request transaction by the client factory's `withWorkspace`. */
export const WORKSPACE_GUC = "app.workspace_id";

/**
 * Tables carrying tenant rows, derived from the Drizzle table objects so a
 * rename cannot silently strand a table without policies. Excluded by design:
 * `workspaces` (the thing the GUC points at), `workspace_memberships`
 * (user-scoped before any GUC exists), and the Better Auth tables
 * (user-scoped per ADR-0005). Note `audit_logs` rows with NULL workspace_id
 * fail both clauses — tenant sessions can neither read nor write them, per
 * that table's own doc; they belong to admin/job connections only.
 */
const tenantTables = [contentDrafts, contentVersions, media, customDomains, auditLogs];

export const RLS_TABLE_NAMES: string[] = tenantTables.map((table) => getTableName(table));

const tenantPredicate = `workspace_id = NULLIF(current_setting('${WORKSPACE_GUC}', true), '')::uuid`;

/** ENABLE + FORCE + one `FOR ALL` policy. `USING` covers SELECT/UPDATE/DELETE
 * and `WITH CHECK` covers INSERT plus UPDATE's new rows — exactly the
 * ADR-0002 contract, in one policy per table. */
export function rlsStatementsFor(tableName: string): string[] {
  return [
    `ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY;`,
    [
      `CREATE POLICY "${tableName}_tenant_isolation" ON "${tableName}"`,
      `  FOR ALL`,
      `  USING (${tenantPredicate})`,
      `  WITH CHECK (${tenantPredicate});`,
    ].join("\n"),
  ];
}

/** Every RLS statement for every tenant table, in application order. */
export function allRlsStatements(): string[] {
  return RLS_TABLE_NAMES.flatMap((tableName) => rlsStatementsFor(tableName));
}
