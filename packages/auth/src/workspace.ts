import type { Db } from "@plinth/db";
import { sessions, workspaceMemberships, workspaces } from "@plinth/db/schema";
import type { AppSession, WorkspaceRole } from "@plinth/schema/auth";
import { and, asc, eq } from "drizzle-orm";

/**
 * Workspace membership queries and the switch-workspace action (ADR-0005).
 * These run BEFORE any tenant GUC exists — memberships and workspaces are
 * deliberately not RLS-scoped, so user_id scoping here is the isolation
 * boundary. That is why activation re-checks membership instead of trusting
 * the caller: it is the door RLS cannot guard.
 */

/** Thrown when a user tries to activate a workspace they don't belong to. */
export class WorkspaceAccessError extends Error {
  constructor(workspaceId: string) {
    super(`No membership in workspace ${workspaceId}.`);
    this.name = "WorkspaceAccessError";
  }
}

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

/** Every workspace the user belongs to, oldest first (workspace #0 leads). */
export async function listUserWorkspaces(db: Db, userId: string): Promise<WorkspaceSummary[]> {
  return db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: workspaceMemberships.role,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
    .where(eq(workspaceMemberships.userId, userId))
    .orderBy(asc(workspaces.createdAt));
}

/**
 * Make `workspaceId` the session's active workspace — after proving the
 * session's user actually belongs to it (the cross-tenant door, ADR-0002's
 * review companion). Scoped to `session.sessionId`, so switching on one
 * device never changes another device's active workspace.
 */
export async function activateWorkspace({
  db,
  session,
  workspaceId,
}: {
  db: Db;
  session: AppSession;
  workspaceId: string;
}): Promise<void> {
  const membership = await db
    .select({ workspaceId: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, session.user.id),
      ),
    )
    .limit(1);
  if (membership.length === 0) throw new WorkspaceAccessError(workspaceId);

  await db
    .update(sessions)
    .set({ activeWorkspaceId: workspaceId })
    .where(eq(sessions.id, session.sessionId));
}
