"use client";

import type { WorkspaceSummary } from "@plinth/auth";
import { Button } from "@plinth/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plinth/ui/components/dropdown-menu";
import { useTransition } from "react";
import { selectWorkspace } from "@/server/actions/workspaces";

/**
 * Active-workspace indicator; becomes a menu only when there is something to
 * switch to. Selection calls the server action, whose revalidation re-renders
 * the authed layout with the new workspace.
 */
export function WorkspaceSwitcher({
  active,
  memberships,
}: {
  active: WorkspaceSummary | null;
  memberships: WorkspaceSummary[];
}) {
  const [isPending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return <span className="text-sm font-medium">{active?.name ?? "No workspace"}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          {isPending ? "Switching…" : (active?.name ?? "Select workspace")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {memberships.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            disabled={workspace.id === active?.id}
            onSelect={() => startTransition(() => selectWorkspace(workspace.id))}
          >
            {workspace.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
