import { withWorkspace } from "@plinth/db";
import {
  contentDrafts,
  sessions,
  verifications,
  workspaceMemberships,
  workspaces,
} from "@plinth/db/schema";
import { setupTestDb, type MigratedTestDb } from "@plinth/db/test-utils";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "./server";
import { getSession, withSessionWorkspace } from "./session";

const BASE_URL = "http://localhost:3000";
const AUTH = `${BASE_URL}/api/auth`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sender that records the last magic-link URL instead of emailing it — the
 * test then "clicks" that URL through the handler. */
let capturedUrl: string | null = null;

function sessionCookieFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("better-auth.session_token="));
  if (!cookie) throw new Error(`no session cookie set: ${res.headers.getSetCookie().join(" | ")}`);
  return cookie.split(";")[0]!;
}

/**
 * Real end-to-end auth against a containerized Postgres (ADR-0005). Driving
 * Better Auth's own HTTP handler — not mocks — is what proves the wiring
 * holds: the drizzle adapter, the uuid `generateId` pairing the schema header
 * warns about, and the magic-link plugin all have to agree or this fails.
 */
describe("magic-link auth lifecycle", () => {
  let testDb: MigratedTestDb;
  let auth: Auth;

  beforeAll(async () => {
    testDb = await setupTestDb();
    auth = createAuth({
      db: testDb.db,
      baseURL: BASE_URL,
      secret: "test-secret-at-least-32-chars-long-xx",
      emailSender: {
        async sendMagicLink({ url }) {
          capturedUrl = url;
        },
      },
    });
  });

  afterAll(() => testDb.stop());

  /** Sign in by email and return the issued session cookie + the link used. */
  async function signIn(email: string): Promise<{ cookie: string; url: string }> {
    capturedUrl = null;
    const res = await auth.handler(
      new Request(`${AUTH}/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(capturedUrl).toBeTruthy();
    const url = capturedUrl!;
    const verify = await auth.handler(new Request(url, { method: "GET" }));
    return { cookie: sessionCookieFrom(verify), url };
  }

  it("creates a user + session and getSession maps it to the AppSession contract", async () => {
    const { cookie } = await signIn("owner@plinth.test");
    const session = await getSession({ auth, headers: new Headers({ cookie }) });
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe("owner@plinth.test");
    expect(session!.user.id).toMatch(UUID_RE); // uuid generateId pairing holds
    expect(session!.activeWorkspaceId).toBeNull(); // no workspace yet
  });

  it("consumes the magic-link token single-use", async () => {
    capturedUrl = null;
    await auth.handler(
      new Request(`${AUTH}/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "single@plinth.test", callbackURL: "/" }),
      }),
    );
    const url = capturedUrl!;
    // First click verifies and consumes the token.
    await auth.handler(new Request(url, { method: "GET" }));
    const [{ remaining } = { remaining: -1 }] = await testDb.db
      .select({ remaining: count() })
      .from(verifications);
    expect(remaining).toBe(0);
  });

  it("revokes the session on sign-out", async () => {
    const { cookie } = await signIn("revoke@plinth.test");
    expect(await getSession({ auth, headers: new Headers({ cookie }) })).not.toBeNull();

    await auth.handler(new Request(`${AUTH}/sign-out`, { method: "POST", headers: { cookie } }));
    expect(await getSession({ auth, headers: new Headers({ cookie }) })).toBeNull();
  });

  it("reflects the active workspace and bridges it to RLS", async () => {
    const { cookie } = await signIn("switcher@plinth.test");
    const before = await getSession({ auth, headers: new Headers({ cookie }) });
    const userId = before!.user.id;

    const [ws] = await testDb.db
      .insert(workspaces)
      .values({ slug: "switch-ws", name: "Switch WS" })
      .returning({ id: workspaces.id });
    await testDb.db.insert(workspaceMemberships).values({
      workspaceId: ws!.id,
      userId,
      role: "owner",
    });
    // What a "switch workspace" server action does: set the session column.
    await testDb.db
      .update(sessions)
      .set({ activeWorkspaceId: ws!.id })
      .where(eq(sessions.userId, userId));

    const after = await getSession({ auth, headers: new Headers({ cookie }) });
    expect(after!.activeWorkspaceId).toBe(ws!.id);

    // The GUC bridge scopes a tenant write/read to that workspace.
    await withSessionWorkspace(testDb.db, after!, (tx) =>
      tx.insert(contentDrafts).values({
        workspaceId: ws!.id,
        document: { schemaVersion: 1, sections: [] },
      }),
    );
    const drafts = await withWorkspace(testDb.db, ws!.id, (tx) => tx.select().from(contentDrafts));
    expect(drafts).toHaveLength(1);
  });
});
