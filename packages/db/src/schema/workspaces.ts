import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { contentVersions } from "./contentVersions";

/**
 * The tenant root. Every tenant-owned table references workspaces.id with
 * `on delete cascade` and carries RLS (ADR-0002). The workspaces table itself
 * is not RLS-scoped — it is the thing the GUC points at.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Subdomain + KV routing key: `{slug}.plinth.farulivan.com`. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Which template package renders this workspace (ADR-0001). */
  templateId: text("template_id").notNull().default("template-norven"),
  /** The Live pointer (ADR-0003): promote and rollback are both one UPDATE
   * here. Lazy callback breaks the workspaces ↔ content_versions import
   * cycle (Drizzle's documented pattern for circular FKs). */
  currentVersionId: uuid("current_version_id").references((): AnyPgColumn => contentVersions.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Mirrors `workspaceRole` in @plinth/schema — change both together. */
export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "member"]);

/** User ↔ workspace membership. Scoped by user_id in queries (the session
 * middleware reads "which workspaces does this user belong to" before any
 * GUC exists), so no RLS here either — per ADR-0005. */
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_memberships_userId_idx").on(table.userId),
  ],
);

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
}));

export const workspaceMembershipsRelations = relations(workspaceMemberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMemberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMemberships.userId], references: [users.id] }),
}));
