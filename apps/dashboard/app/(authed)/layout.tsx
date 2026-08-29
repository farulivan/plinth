import { activateWorkspace, getSession, listUserWorkspaces } from "@plinth/auth";
import { SidebarInset, SidebarProvider } from "@plinth/ui/components/sidebar";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ShellHeader } from "@/components/shell-header";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

/**
 * The authed shell: real session validation (the edge proxy only gates on
 * cookie presence, ADR-0005), workspace context for every page under it, and
 * the sidebar chrome. First authed load with no active workspace adopts the
 * first membership — the Norven-first flow has exactly one.
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

  // Seeded from the cookie the provider writes on toggle, so a collapsed
  // sidebar stays collapsed across navigation without a flash of expanded.
  const sidebarState = (await cookies()).get("sidebar_state")?.value;
  const defaultOpen = sidebarState !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        activeWorkspace={active}
        memberships={memberships}
        userEmail={session.user.email}
      />
      <SidebarInset>
        <ShellHeader />
        {active ? (
          children
        ) : (
          <main className="mx-auto flex max-w-md flex-col items-center gap-2 p-16 text-center">
            <h1 className="text-xl font-semibold">No workspace yet</h1>
            <p className="text-muted-foreground text-sm">
              Your account has no workspace membership. Workspaces are provisioned during onboarding
              — reply to your onboarding email and one will be linked to this account.
            </p>
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
