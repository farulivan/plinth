import type { LooseContentDocument } from "@plinth/schema";
import { relations } from "drizzle-orm";
import { jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

/**
 * The one mutable content row per workspace (ADR-0003). The editor's Server
 * Actions write here on every debounced save; the preview SSR route reads it
 * by id (`/preview/[draft_id]`, ADR-0007). RLS-scoped (ADR-0002).
 */
export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Template-agnostic envelope; the template's own schema validates at
     * publish time. Typed via @plinth/schema so consumers get the shape. */
    document: jsonb("document").$type<LooseContentDocument>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("content_drafts_workspaceId_unique").on(table.workspaceId)],
);

export const contentDraftsRelations = relations(contentDrafts, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contentDrafts.workspaceId],
    references: [workspaces.id],
  }),
}));
