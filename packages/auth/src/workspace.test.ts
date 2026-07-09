import { sessions, workspaceMemberships, workspaces } from "@plinth/db/schema";
import { setupTestDb, type MigratedTestDb } from "@plinth/db/test-utils";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "./server";
import { getSession } from "./session";
import { activateWorkspace, listUserWorkspaces, WorkspaceAccessError } from "./workspace";

const BASE_URL = "http://localhost:3000";
const AUTH = `${BASE_URL}/api/auth`;

let capturedUrl: string | null = null;

function sessionCookieFrom(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("better-auth.session_token="));
  if (!cookie) throw new Error(`no session cookie set: ${res.headers.getSetCookie().join(" | ")}`);
  return cookie.split(";")[0]!;
}

/**
 * The membership guard is the cross-tenant door RLS cannot cover: workspaces
 * and memberships are deliberately un-RLS'd (ADR-0005), so activation is
 * where "user cannot act on a workspace they don't belong to" must hold.
 * Probed here against real Postgres, like the RLS probe it complements.
 */
describe("workspace activation", () => {
  let testDb: MigratedTestDb;
  let auth: Auth;
  let wsA: string;
  let wsB: string;

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

    const [a, b] = await testDb.db
      .insert(workspaces)
      .values([
        { slug: "studio-a", name: "Studio A" },
        { slug: "studio-b", name: "Studio B" },
      ])
      .returning({ id: workspaces.id });
    wsA = a!.id;
    wsB = b!.id;
  });

  afterAll(() => testDb.stop());

  async function signIn(email: string): Promise<{ cookie: string }> {
    capturedUrl = null;
    await auth.handler(
      new Request(`${AUTH}/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    );
    const verify = await auth.handler(new Request(capturedUrl!, { method: "GET" }));
    return { cookie: sessionCookieFrom(verify) };
  }

  it("lists only the user's own memberships", async () => {
    const { cookie } = await signIn("member-a@plinth.test");
    const session = (await getSession({ auth, headers: new Headers({ cookie }) }))!;
    await testDb.db
      .insert(workspaceMemberships)
      .values({ workspaceId: wsA, userId: session.user.id, role: "owner" });

    const mine = await listUserWorkspaces(testDb.db, session.user.id);
    expect(mine.map((w) => w.slug)).toEqual(["studio-a"]);
    expect(mine[0]!.role).toBe("owner");
  });

  it("activates a workspace the user belongs to and getSession reflects it", async () => {
    const { cookie } = await signIn("switch@plinth.test");
    const session = (await getSession({ auth, headers: new Headers({ cookie }) }))!;
    await testDb.db
      .insert(workspaceMemberships)
      .values({ workspaceId: wsB, userId: session.user.id, role: "member" });

    await activateWorkspace({ db: testDb.db, session, workspaceId: wsB });

    const after = await getSession({ auth, headers: new Headers({ cookie }) });
    expect(after!.activeWorkspaceId).toBe(wsB);
  });

  it("refuses to activate a workspace the user does not belong to", async () => {
    const { cookie } = await signIn("intruder@plinth.test");
    const session = (await getSession({ auth, headers: new Headers({ cookie }) }))!;

    await expect(
      activateWorkspace({ db: testDb.db, session, workspaceId: wsA }),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);

    // The guard failed closed: the session row is untouched.
    const after = await getSession({ auth, headers: new Headers({ cookie }) });
    expect(after!.activeWorkspaceId).toBeNull();
  });

  it("scopes activation to the asking session, not every device", async () => {
    const first = await signIn("two-devices@plinth.test");
    const second = await signIn("two-devices@plinth.test");
    const firstSession = (await getSession({
      auth,
      headers: new Headers({ cookie: first.cookie }),
    }))!;
    await testDb.db
      .insert(workspaceMemberships)
      .values({ workspaceId: wsA, userId: firstSession.user.id, role: "owner" });

    await activateWorkspace({ db: testDb.db, session: firstSession, workspaceId: wsA });

    const firstAfter = await getSession({ auth, headers: new Headers({ cookie: first.cookie }) });
    const secondAfter = await getSession({ auth, headers: new Headers({ cookie: second.cookie }) });
    expect(firstAfter!.activeWorkspaceId).toBe(wsA);
    expect(secondAfter!.activeWorkspaceId).toBeNull();

    // Belt and suspenders: exactly one session row carries the workspace.
    const rows = await testDb.db
      .select({ active: sessions.activeWorkspaceId })
      .from(sessions)
      .where(eq(sessions.userId, firstSession.user.id));
    expect(rows.filter((r) => r.active === wsA)).toHaveLength(1);
  });
});
