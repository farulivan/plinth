"use client";

import { Avatar, AvatarFallback } from "@plinth/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@plinth/ui/components/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@plinth/ui/components/sidebar";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";
import { authClient } from "@/lib/auth-client";

const subscribe = () => () => {};

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Account menu at the foot of the sidebar: identity, theme choice, sign out.
 * next-themes' `theme` is only trustworthy after mount (the server can't know
 * it), so the radio group renders once hydrated.
 */
export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { theme, setTheme } = useTheme();
  // The server can't know the active theme; this flips true after hydration
  // without an effect (the setState-in-effect pattern fails the lint gate).
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {email.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-sm">{email}</span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="dark:hidden" />
                <Moon className="hidden dark:block" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {mounted ? (
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        <Icon />
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                ) : (
                  themeOptions.map(({ value, label, icon: Icon }) => (
                    <DropdownMenuItem key={value} disabled>
                      <Icon />
                      {label}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isPending}
              onSelect={() =>
                startTransition(async () => {
                  await authClient.signOut();
                  router.push("/login");
                  router.refresh();
                })
              }
            >
              <LogOut />
              {isPending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
