import { withWorkspace, type Db } from "@plinth/db";
import { contentVersions, workspaces } from "@plinth/db/schema";
import { eq } from "drizzle-orm";

/**
 * Data access for the domains module (ADR-0009). Until the custom-domains
 * table wires up (post-v1, ADR-0004), the only hostname source is the
 * workspace slug; `workspaces` is deliberately un-RLS'd (the GUC target) and
 * the caller passes a workspace id it already proved through the promote
 * event or a membership check.
 */
export async function getWorkspaceSlug(db: Db, workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return row?.slug ?? null;
}

/**
 * The site settings of a workspace's published version.
 *
 * Read from the VERSION, not the draft. The edge policy has to describe what
 * is actually being served: a key removed in the draft but still live would
 * otherwise have its form blocked before the change was published, and one
 * added in the draft would be granted before it existed.
 */
export async function getPublishedSiteSettings(
  db: Db,
  workspaceId: string,
  versionNumber: number,
): Promise<{ contactFormKey?: string } | null> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({ snapshot: contentVersions.snapshot })
      .from(contentVersions)
      .where(eq(contentVersions.versionNumber, versionNumber)),
  );
  if (!row) return null;
  // Read structurally rather than parsed: a v1 snapshot has no site settings
  // at all, and rolling back to one must not fail the sync that points the
  // edge at it.
  const site = (row.snapshot as { site?: { contactFormKey?: unknown } }).site;
  return typeof site?.contactFormKey === "string" && site.contactFormKey
    ? { contactFormKey: site.contactFormKey }
    : {};
}
