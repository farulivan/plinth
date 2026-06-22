import type { Db } from "@plinth/db";
import type { AppSession } from "@plinth/schema/auth";
import { createMiddleware } from "hono/factory";

/**
 * Per-request Hono context for the api (ADR-0008). `session` is resolved
 * upstream by @plinth/auth's sessionMiddleware; `db` is the shared pool. Tenant
 * scoping is NOT applied here — it happens per query via withSessionWorkspace,
 * so a request that never touches tenant data never opens a transaction
 * (ADR-0002).
 */
export interface AppBindings {
  Variables: {
    db: Db;
    session: AppSession | null;
    workspaceId: string | null;
  };
}

/** Attaches the shared db pool and derives the active workspace from the
 * already-resolved session. */
export function dbContext(db: Db) {
  return createMiddleware<AppBindings>(async (c, next) => {
    c.set("db", db);
    c.set("workspaceId", c.get("session")?.activeWorkspaceId ?? null);
    await next();
  });
}
