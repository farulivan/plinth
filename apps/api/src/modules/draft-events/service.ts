import type { Db } from "@plinth/db";
import { draftVisible } from "./db";

/**
 * Access decision for the draft-events surface (ADR-0009: plain function, no
 * HTTP). Both the notify POST and the SSE subscribe gate on the same answer:
 * the caller needs an active workspace, and the draft must be visible inside
 * it (RLS scoping — the cross-tenant door stays shut even with a leaked id).
 */
export type DraftAccess = "ok" | "no-workspace" | "not-found";

export async function checkDraftAccess(
  db: Db,
  workspaceId: string | null,
  draftId: string,
): Promise<DraftAccess> {
  if (!workspaceId) return "no-workspace";
  return (await draftVisible(db, workspaceId, draftId)) ? "ok" : "not-found";
}
