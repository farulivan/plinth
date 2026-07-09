import { activateWorkspace, getSession, listUserWorkspaces } from "@plinth/auth";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

/**
 * The authed shell: real session validation (the edge proxy only gates on
 * cookie presence, ADR-0005), workspace context for every page under it, and
 * the app chrome. First authed load with no active workspace adopts the first
 * membership — the Norven-first flow has exactly one.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession({ auth, headers: await headers() });
  if (!session) redirect("/login");

  const memberships = await listUserWorkspaces(db, session.user.id);
  let activeWorkspaceId = session.activeWorkspaceId;
  if (!activeWorkspaceId && memberships[0]) {
    await activateWorkspace({ db, session, workspaceId: memberships[0].id });
    activeWorkspaceId = memberships[0].id;
  }
  const active = memberships.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-6">
          <Link href="/" className="font-semibold">
            Plinth
          </Link>
          <Link href="/media" className="text-muted-foreground hover:text-foreground text-sm">
            Media
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <WorkspaceSwitcher active={active} memberships={memberships} />
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {session.user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      {active ? (
        children
      ) : (
        <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-16 text-center">
          <h1 className="text-xl font-semibold">No workspace yet</h1>
          <p className="text-muted-foreground text-sm">
            Your account has no workspace membership. Workspaces are provisioned during onboarding —
            reply to your onboarding email and one will be linked to this account.
          </p>
        </main>
      )}
    </div>
  );
}
