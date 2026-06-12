import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

/** Cloudflare Custom Hostname lifecycle (ADR-0004). `removed` is the 7-day
 * reversible state; the reaper hard-deletes after the cooldown. */
export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "verified",
  "failed",
  "removed",
]);

/**
 * Custom hostnames bound to a workspace (ADR-0004). The DB-level `hostname`
 * unique constraint is the first line against two tenants claiming the same
 * domain — it fails with a clear error before any Cloudflare API call.
 * RLS-scoped (ADR-0002).
 */
export const customDomains = pgTable(
  "custom_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    /** Cloudflare's id for the custom hostname; set after the CF API call. */
    cfCustomHostnameId: text("cf_custom_hostname_id"),
    status: domainStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Set when status flips to `removed`; the reaper deletes 7 days later. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [index("custom_domains_workspaceId_idx").on(table.workspaceId)],
);

export const customDomainsRelations = relations(customDomains, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [customDomains.workspaceId],
    references: [workspaces.id],
  }),
}));
