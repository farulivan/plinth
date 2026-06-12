import { relations } from "drizzle-orm";
import { bigint, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

/**
 * Media library rows — one per uploaded original (ADR-0006). Variants live in
 * R2 at `tenants/{workspace_id}/{content_hash}/w{width}.{format}`; this row is
 * the metadata. Alt text deliberately absent — it lives on the content field
 * that references the media (context-dependent). RLS-scoped (ADR-0002).
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** SHA-256 of the original bytes. The (workspace, hash) unique is the
     * dedup key: re-uploading the same photo returns the existing row. */
    contentHash: text("content_hash").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Original file size in bytes — summed (RLS-scoped) for the per-tenant
     * storage cap (5 GB free / 50 GB paid). */
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("media_workspace_hash_unique").on(table.workspaceId, table.contentHash)],
);

export const mediaRelations = relations(media, ({ one }) => ({
  workspace: one(workspaces, { fields: [media.workspaceId], references: [workspaces.id] }),
}));
