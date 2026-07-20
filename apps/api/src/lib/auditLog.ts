import { withWorkspace, type Db } from "@plinth/db";
import { auditLogs } from "@plinth/db/schema";

/**
 * Append-only audit trail (ADR-0002/0005/0006): who did what, in which
 * workspace. Rides withWorkspace so the insert satisfies the tenant RLS
 * policy's WITH CHECK — the same reasoning as every other tenant write.
 *
 * IP address is left unset for now: the api only ever sees the dashboard's
 * server-side request, not the browser's — capturing the real client IP
 * needs the dashboard to forward it explicitly, deferred until a caller
 * needs it.
 */
export interface AuditLogInput {
  workspaceId: string;
  actorUserId: string | null;
  /** Dotted verb, e.g. "publish.requested", "media.uploaded". */
  action: string;
  payload?: Record<string, unknown>;
}

export async function writeAuditLog(db: Db, input: AuditLogInput): Promise<void> {
  await withWorkspace(db, input.workspaceId, (tx) =>
    tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: input.action,
      payload: input.payload ?? {},
    }),
  );
}
