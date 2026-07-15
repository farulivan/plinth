import { getSession, listUserWorkspaces } from "@plinth/auth";
import type { PublishStatus } from "@plinth/schema/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { PublishBar } from "@/components/publish/publish-bar";
import { api } from "@/lib/api-client";
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

  // Split view: form left, live preview right (ADR-0007's iframe transport).
  // The iframe reloads itself via the SSE loop inside the preview page, so
  // the editor never has to reach into it.
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <PublishBar initial={initialStatus} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <Editor draftId={draftId} templateId={templateId} initialDocument={document} />
        </div>
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-8 space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-muted-foreground text-sm font-medium">Preview</h2>
              <a
                href={`/preview/${draftId}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
              >
                Open in new tab
              </a>
            </div>
            <iframe
              src={`/preview/${draftId}`}
              title="Live preview"
              className="h-[calc(100vh-8rem)] w-full rounded-lg border bg-white"
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
