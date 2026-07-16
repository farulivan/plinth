import type { Db } from "@plinth/db";
import { workspaces } from "@plinth/db/schema";
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
