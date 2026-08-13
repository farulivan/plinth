"use client";

import type { LooseContentDocumentV2 } from "@plinth/schema";
import type { PublishStatus } from "@plinth/schema/api";
import { Button } from "@plinth/ui/components/button";
import { useState } from "react";
import { Editor } from "@/components/editor/editor";
import { PublishBar } from "@/components/publish/publish-bar";

/** Preview pane widths (ADR-0007): common device cuts plus the pane itself. */
const PREVIEW_WIDTHS = [
  { label: "375", width: 375 },
  { label: "768", width: 768 },
  { label: "1280", width: 1280 },
  { label: "Full", width: null },
] as const;

/**
 * The one-screen workspace: publish bar, editor, live preview. Client-side
 * because three concerns share state — the editor's saves feed the publish
 * bar's unpublished-changes cue, and the preview pane's width toggle is UI
 * state. The iframe still reloads itself (SSE inside the preview page).
 */
export function WorkspaceStudio({
  draftId,
  templateId,
  initialDocument,
  initialStatus,
  initialDraftHash,
}: {
  draftId: string;
  templateId: string;
  initialDocument: LooseContentDocumentV2;
  initialStatus: PublishStatus;
  initialDraftHash: string;
}) {
  const [draftHash, setDraftHash] = useState<string | null>(initialDraftHash);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  // The page the editor has open, so the preview shows what is being edited
  // rather than always the home page.
  const [previewPath, setPreviewPath] = useState("/");
  // One URL for the iframe and the "open in new tab" link, so the tab can
  // never show a different page from the panel beside it.
  //
  // The root is the trap, in the same shape it was in the builder and in a
  // different disguise: a required catch-all matches one segment or more, so
  // `/p` — which is what the home page produces — matched no route at all and
  // 404ed. Every other page worked, and the preview panel simply said "page
  // not found" on the one page every author opens first. The segment is
  // optional now, and the home page is the reason.
  const previewHref = `/preview/${draftId}/p${previewPath === "/" ? "" : previewPath}`;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <PublishBar initial={initialStatus} draftHash={draftHash} />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <Editor
            draftId={draftId}
            templateId={templateId}
            initialDocument={initialDocument}
            onSaved={setDraftHash}
            onPageChange={setPreviewPath}
          />
        </div>
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-8 space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-muted-foreground text-sm font-medium">Preview</h2>
              <div className="flex items-center gap-1">
                {PREVIEW_WIDTHS.map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    size="sm"
                    variant={previewWidth === option.width ? "secondary" : "ghost"}
                    onClick={() => setPreviewWidth(option.width)}
                  >
                    {option.label}
                  </Button>
                ))}
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground ml-2 text-sm underline underline-offset-4"
                >
                  Open in new tab
                </a>
              </div>
            </div>
            <div
              className="mx-auto max-w-full transition-[width]"
              style={{ width: previewWidth ?? "100%" }}
            >
              <iframe
                src={previewHref}
                title="Live preview"
                className="h-[calc(100vh-8rem)] w-full rounded-lg border bg-white"
              />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
