"use server";

import { getSession } from "@plinth/auth";
import { looseContentDocument } from "@plinth/schema";
import { err, ok, type Envelope } from "@plinth/schema/api";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { DraftNotFoundError, saveDraftDocument } from "@/server/services/drafts";

/**
 * Autosave target for the editor's debounced writes. Speaks the shared
 * envelope (the same shape api routes return), so the editor handles
 * failures identically regardless of transport. Validation here is the
 * template-agnostic envelope only — drafts may hold half-typed fields; the
 * template schema gates publish, not save (ADR-0007).
 *
 * Never throws: infrastructure failures (db unreachable, session lookup
 * dying) become the "internal" envelope error instead of a rejected action —
 * a thrown server action reaches the client as an opaque 500, which froze
 * the save chip on "Saving…" when Postgres was down.
 */
export async function saveDraft(
  draftId: string,
  document: unknown,
): Promise<Envelope<{ savedAt: string }>> {
  try {
    const session = await getSession({ auth, headers: await headers() });
    if (!session?.activeWorkspaceId) {
      return err("unauthorized", "Sign in with an active workspace to save.");
    }

    const id = z.uuid().safeParse(draftId);
    if (!id.success) return err("validation_failed", "Malformed draft id.");
    const parsed = looseContentDocument.safeParse(document);
    if (!parsed.success) {
      return err("validation_failed", "The draft did not match the document envelope.");
    }

    const { savedAt } = await saveDraftDocument(
      db,
      session.activeWorkspaceId,
      id.data,
      parsed.data,
    );
    return ok({ savedAt: savedAt.toISOString() });
  } catch (error) {
    if (error instanceof DraftNotFoundError) {
      return err("not_found", "This draft no longer belongs to your active workspace.");
    }
    console.error("[saveDraft] unexpected failure:", error);
    return err(
      "internal",
      "The server could not save — your edits stay here and the next change retries.",
    );
  }
}
