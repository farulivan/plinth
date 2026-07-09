"use server";

import { activateWorkspace, getSession } from "@plinth/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

/**
 * Switch the caller's active workspace (ADR-0005: switching is a session
 * update, not a re-login). The membership guard lives in activateWorkspace —
 * a non-member attempt throws and reaches the error boundary; the switcher UI
 * only ever offers real memberships, so that path is hostile traffic, not UX.
 */
export async function selectWorkspace(workspaceId: string): Promise<void> {
  const id = z.uuid().parse(workspaceId);
  const session = await getSession({ auth, headers: await headers() });
  if (!session) redirect("/login");

  await activateWorkspace({ db, session, workspaceId: id });
  revalidatePath("/", "layout");
}
