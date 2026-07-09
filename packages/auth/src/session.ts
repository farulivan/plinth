import type { Db } from "@plinth/db";
import { withWorkspace } from "@plinth/db";
import { type AppSession, appSession } from "@plinth/schema/auth";
import type { Auth } from "./server";

/**
 * The auth → rest-of-system contract (ADR-0005). Resolves Better Auth's
 * session from request headers and narrows it to the `AppSession` shape every
 * consumer depends on. Returns null when unauthenticated — callers decide
 * whether that's a redirect (dashboard) or a 401 (api).
 *
 * Validated through @plinth/schema, not cast: a drift between Better Auth's
 * runtime shape and the contract fails loudly here, not three layers deep.
 */
export async function getSession({
  auth,
  headers,
}: {
  auth: Auth;
  headers: Headers;
}): Promise<AppSession | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;

  return appSession.parse({
    sessionId: result.session.id,
    user: {
      id: result.user.id,
      email: result.user.email,
      // Better Auth stores "no name" as "", but the contract is nullable —
      // map empty to null so the schema's min(1) holds.
      name: result.user.name || null,
    },
    activeWorkspaceId: result.session.activeWorkspaceId ?? null,
  });
}

/**
 * The GUC bridge (ADR-0002/0005): run `fn` with RLS scoped to the session's
 * active workspace. This is the single seam where an authenticated session
 * turns into a tenant-scoped DB transaction — every tenant query in the api
 * flows through here. Throws if no workspace is active, because a tenant
 * query with no tenant is a bug, not an empty result.
 */
export async function withSessionWorkspace<T>(
  db: Db,
  session: AppSession,
  fn: Parameters<typeof withWorkspace<T>>[2],
): Promise<T> {
  if (!session.activeWorkspaceId) {
    throw new Error("No active workspace on session — cannot scope a tenant query.");
  }
  return withWorkspace(db, session.activeWorkspaceId, fn);
}
