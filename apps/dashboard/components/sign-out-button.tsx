"use client";

import { Button } from "@plinth/ui/components/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.push("/login");
          router.refresh();
        })
      }
    >
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
