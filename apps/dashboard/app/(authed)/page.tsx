import { getSession, listUserWorkspaces } from "@plinth/auth";
import { contentHash } from "@plinth/db";
import type { PublishStatus } from "@plinth/schema/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceStudio } from "@/components/workspace-studio";
import { api } from "@/lib/api-client";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getEditorData } from "@/server/services/drafts";

// The draft is per-request state; nothing here can prerender.
export const dynamic = "force-dynamic";

/** Dashboard home IS the studio (Norven-first: one workspace, one draft):
 * publish bar, schema-driven editor, live preview. */
export default async function EditorPage() {
  const session = await getSession({ auth, headers: await headers() });
  if (!session) redirect("/login");

  // On the very first authed render the layout's auto-activation may still be
  // in flight in this same request, so fall back to the first membership —
  // the same guarded source activation itself uses. No membership: the layout
  // renders its empty state instead of children.
  const workspaceId =
    session.activeWorkspaceId ?? (await listUserWorkspaces(db, session.user.id))[0]?.id ?? null;
  if (!workspaceId) return null;

  const { draftId, document, templateId } = await getEditorData(db, workspaceId);

  // The publish bar polls client-side after the first paint; this initial
  // fetch only saves it a blank frame. A transport failure degrades to
  // "Never published" rather than failing the page.
  let initialStatus: PublishStatus = { currentVersionId: null, latest: null };
  try {
    const envelope = await (await api.publish.status.$get()).json();
    if (envelope.ok) initialStatus = envelope.data;
  } catch {
    // api unreachable — the bar's first poll retries.
  }

  return (
    <WorkspaceStudio
      draftId={draftId}
      templateId={templateId}
      initialDocument={document}
      initialStatus={initialStatus}
      initialDraftHash={contentHash(document)}
    />
  );
}
