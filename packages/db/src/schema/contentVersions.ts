import type { LooseContentDocument } from "@plinth/schema";
import { isNotNull, relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

/** Build lifecycle for the dashboard's "Publishing…" surface. A failed build
 * never moves `workspaces.current_version_id` (ADR-0003). */
export const versionStatusEnum = pgEnum("version_status", [
  "queued",
  "building",
  "built",
  "failed",
]);

/**
 * Immutable snapshot per publish click (ADR-0003). Rows are never updated
 * except `status`; rollback is repointing `workspaces.current_version_id`
 * at an older row. The daily reaper deletes rows past the retention window
 * (10 most recent per tenant). RLS-scoped (ADR-0002).
 */
export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Monotonic per workspace — the `v{N}` in the R2 site path. */
    versionNumber: integer("version_number").notNull(),
    snapshot: jsonb("snapshot").$type<LooseContentDocument>().notNull(),
    /** SHA-256 of the canonical snapshot JSON — content addressing + the
     * preview hash check (ADR-0007). */
    contentHash: text("content_hash").notNull(),
    /** Publish API idempotency (ADR-0003): retried clicks reuse the row via
     * the unique constraint instead of double-publishing. Partial index —
     * keys are optional (rollbacks, system publishes). */
    idempotencyKey: text("idempotency_key"),
    status: versionStatusEnum("status").notNull().default("queued"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("content_versions_workspace_version_unique").on(
      table.workspaceId,
      table.versionNumber,
    ),
    uniqueIndex("content_versions_workspace_idempotency_unique")
      .on(table.workspaceId, table.idempotencyKey)
      .where(isNotNull(table.idempotencyKey)),
  ],
);

export const contentVersionsRelations = relations(contentVersions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contentVersions.workspaceId],
    references: [workspaces.id],
  }),
  author: one(users, { fields: [contentVersions.createdBy], references: [users.id] }),
}));
