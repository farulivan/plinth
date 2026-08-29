"use client";

import type { WorkspaceSummary } from "@plinth/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@plinth/ui/components/sidebar";
import { Images, PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/user-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

const navItems = [
  { href: "/", label: "Studio", icon: PanelsTopLeft },
  { href: "/media", label: "Media", icon: Images },
] as const;

/**
 * The dashboard's primary navigation. Workspace switching lives in the header,
 * the account menu in the footer; the rail keeps collapse one click away.
 */
export function AppSidebar({
  activeWorkspace,
  memberships,
  userEmail,
}: {
  activeWorkspace: WorkspaceSummary | null;
  memberships: WorkspaceSummary[];
  userEmail: string;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher active={activeWorkspace} memberships={memberships} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plinth</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={href === "/" ? pathname === "/" : pathname.startsWith(href)}
                    tooltip={label}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={userEmail} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
