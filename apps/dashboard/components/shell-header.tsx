"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@plinth/ui/components/breadcrumb";
import { Separator } from "@plinth/ui/components/separator";
import { SidebarTrigger } from "@plinth/ui/components/sidebar";
import { usePathname } from "next/navigation";
import { ShellActionsSlot } from "@/components/shell-actions";

const titles: Record<string, string> = {
  "/": "Studio",
  "/media": "Media",
};

/**
 * The strip above every authed page: sidebar toggle plus where-you-are. Page
 * titles derive from the pathname; routes with their own chrome (the studio's
 * publish controls) render below it.
 */
export function ShellHeader() {
  const pathname = usePathname();
  const title =
    titles[pathname] ??
    (pathname.startsWith("/media")
      ? "Media"
      : (pathname.split("/").filter(Boolean)[0] ?? "Studio"));

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium capitalize">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        <ShellActionsSlot />
      </div>
    </header>
  );
}
