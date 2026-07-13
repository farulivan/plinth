import { withWorkspace, type Db } from "@plinth/db";
import { contentDrafts } from "@plinth/db/schema";
import { eq } from "drizzle-orm";

/** RLS visibility probe: true iff the draft exists inside the given
 * workspace's row-security scope — a foreign draft id matches zero rows. */
export async function draftVisible(db: Db, workspaceId: string, draftId: string): Promise<boolean> {
  const rows = await withWorkspace(db, workspaceId, (tx) =>
    tx.select({ id: contentDrafts.id }).from(contentDrafts).where(eq(contentDrafts.id, draftId)),
  );
  return rows.length > 0;
}
