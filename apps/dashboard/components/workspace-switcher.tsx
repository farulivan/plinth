"use client";

import type { WorkspaceSummary } from "@plinth/auth";
import { Avatar, AvatarFallback } from "@plinth/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@plinth/ui/components/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@plinth/ui/components/sidebar";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTransition } from "react";
import { selectWorkspace } from "@/server/actions/workspaces";

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Active-workspace indicator in the sidebar header; becomes a menu only when
 * there is something to switch to. Selection calls the server action, whose
 * revalidation re-renders the authed layout with the new workspace.
 */
export function WorkspaceSwitcher({
  active,
  memberships,
}: {
  active: WorkspaceSummary | null;
  memberships: WorkspaceSummary[];
}) {
  const [isPending, startTransition] = useTransition();

  const badge = (
    <Avatar className="size-8 rounded-lg">
      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
        {active ? initialsFor(active.name) : "?"}
      </AvatarFallback>
    </Avatar>
  );

  if (memberships.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {badge}
            <span className="truncate font-medium">{active?.name ?? "No workspace"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" disabled={isPending}>
              {badge}
              <span className="truncate font-medium">
                {isPending ? "Switching…" : (active?.name ?? "Select workspace")}
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {memberships.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                disabled={workspace.id === active?.id}
                onSelect={() => startTransition(() => selectWorkspace(workspace.id))}
              >
                <Avatar className="size-6 rounded-md">
                  <AvatarFallback className="rounded-md text-[10px]">
                    {initialsFor(workspace.name)}
                  </AvatarFallback>
                </Avatar>
                {workspace.name}
                {workspace.id === active?.id ? <Check className="ml-auto size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
