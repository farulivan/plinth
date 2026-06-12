import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

/**
 * Append-only audit trail (ADR-0002/0005/0006). Reading is RLS-scoped, and
 * `workspace_id` is deliberately NULLABLE: auth events with no workspace
 * context (a login before any workspace exists) carry NULL, which the RLS
 * predicate (`workspace_id = guc`) hides from every tenant read — those rows
 * are reachable only by an admin connection that bypasses RLS.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    /** NULL for system actions (reapers, KV sync). */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. "auth.login", "media.upload", "publish.succeeded".
     * Free-form text, not an enum — new actions must not need a migration. */
    action: text("action").notNull(),
    /** Action-specific details (version_id, content_hash, duration_ms,
     * outcome…) — never raw bytes, never secrets (ADR-0006). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt)],
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  workspace: one(workspaces, { fields: [auditLogs.workspaceId], references: [workspaces.id] }),
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
