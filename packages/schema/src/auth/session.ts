import { z } from "zod";
import { email } from "./login";

/** Membership role within a workspace. Single-tier for MVP; finer roles
 * (editor, billing) would extend this enum via migration. */
export const workspaceRole = z.enum(["owner", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRole>;

export const sessionUser = z.object({
  id: z.uuid(),
  email,
  name: z.string().trim().min(1).max(120).nullish(),
});
export type SessionUser = z.infer<typeof sessionUser>;

/**
 * The session view every consumer receives from `getSession()` in
 * `packages/auth` — the contract between auth and the rest of the system.
 * `activeWorkspaceId` is the custom session column from ADR-0005; the db
 * layer's GUC bridge (`withWorkspace`) consumes it to scope RLS. Null until
 * the user creates or joins their first workspace. `sessionId` identifies the
 * session row itself so workspace switching updates only the device that
 * asked (ADR-0005), never the user's other sessions.
 */
export const appSession = z.object({
  sessionId: z.uuid(),
  user: sessionUser,
  activeWorkspaceId: z.uuid().nullable(),
});
export type AppSession = z.infer<typeof appSession>;
