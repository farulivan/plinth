import "server-only";
import { withWorkspace, type Db } from "@plinth/db";
import { contentDrafts, workspaces } from "@plinth/db/schema";
import { looseContentDocument, type LooseContentDocument } from "@plinth/schema";
import { eq } from "drizzle-orm";

/**
 * Draft persistence for the editor (ADR-0003: one mutable row per workspace;
 * ADR-0009: dashboard services mirror the api's module shape). Callers
 * resolve `workspaceId` from a guarded source (the session's active
 * workspace, or the caller's own membership list on the first-login render
 * where activation is still in flight); every tenant read/write here rides
 * withWorkspace, so RLS scopes it — a draft id from another workspace simply
 * matches zero rows.
 */

export class DraftNotFoundError extends Error {
  constructor(draftId: string) {
    super(`Draft ${draftId} not found in the active workspace.`);
    this.name = "DraftNotFoundError";
  }
}

export interface EditorData {
  draftId: string;
  document: LooseContentDocument;
  templateId: string;
}

/** Norven-first onboarding default: one filled intro section so the editor
 * opens non-empty and the document satisfies the envelope's min(1). Becomes
 * template-aware when a second template lands. */
const DEFAULT_DOCUMENT: LooseContentDocument = looseContentDocument.parse({
  sections: [
    {
      type: "intro",
      fields: {
        heading: "Welcome to your site",
        body: "This draft was created when you first opened the editor. Replace this text with your own — every save is automatic.",
      },
    },
  ],
});

/** The workspace's draft (created on first open) plus its template. */
export async function getEditorData(db: Db, workspaceId: string): Promise<EditorData> {
  // workspaces is deliberately not RLS-scoped (it's the GUC target); the
  // caller resolved this id from a membership-guarded source.
  const [workspace] = await db
    .select({ templateId: workspaces.templateId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new Error(`Workspace ${workspaceId} no longer exists.`);

  return withWorkspace(db, workspaceId, async (tx) => {
    const [existing] = await tx
      .select({ id: contentDrafts.id, document: contentDrafts.document })
      .from(contentDrafts)
      .where(eq(contentDrafts.workspaceId, workspaceId));
    if (existing) {
      return {
        draftId: existing.id,
        document: existing.document,
        templateId: workspace.templateId,
      };
    }
    const [created] = await tx
      .insert(contentDrafts)
      .values({ workspaceId, document: DEFAULT_DOCUMENT })
      .returning({ id: contentDrafts.id, document: contentDrafts.document });
    return { draftId: created!.id, document: created!.document, templateId: workspace.templateId };
  });
}

/** Persist a full draft document (the editor autosaves whole documents —
 * drafts are small and whole-document writes cannot interleave stale field
 * patches). Returns the row's updated timestamp for the save indicator. */
export async function saveDraftDocument(
  db: Db,
  workspaceId: string,
  draftId: string,
  document: LooseContentDocument,
): Promise<{ savedAt: Date }> {
  return withWorkspace(db, workspaceId, async (tx) => {
    const [updated] = await tx
      .update(contentDrafts)
      .set({ document })
      .where(eq(contentDrafts.id, draftId))
      .returning({ updatedAt: contentDrafts.updatedAt });
    if (!updated) throw new DraftNotFoundError(draftId);
    return { savedAt: updated.updatedAt };
  });
}
