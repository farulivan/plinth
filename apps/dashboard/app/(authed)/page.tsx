import { getSession, listUserWorkspaces } from "@plinth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getEditorData } from "@/server/services/drafts";

// The draft is per-request state; nothing here can prerender.
export const dynamic = "force-dynamic";

/** Dashboard home IS the editor (Norven-first: one workspace, one draft). */
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

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Editor draftId={draftId} templateId={templateId} initialDocument={document} />
    </main>
  );
}
