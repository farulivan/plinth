"use client";

import { HOME_PATH, type LooseContentDocumentV2, type SectionInstance } from "@plinth/schema";
import { Button } from "@plinth/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plinth/ui/components/dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyFieldsFor, templateFor } from "@/lib/templates";
import { saveDraft } from "@/server/actions/drafts";
import { SectionCard } from "./section-card";
import { SiteSettingsCard } from "./site-settings-card";

type SaveState =
  | { status: "idle" | "pending" | "saving" | "saved" }
  | { status: "error"; detail: string };

const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * The editor root: owns the document, the 500 ms autosave debounce
 * (ADR-0007's update loop), and the structural freedoms — toggle, reorder,
 * add — that ADR-0001 grants. Field editing lives in the per-section forms.
 */
export function Editor({
  draftId,
  templateId,
  initialDocument,
  onSaved,
}: {
  draftId: string;
  templateId: string;
  initialDocument: LooseContentDocumentV2;
  /** Fires with the saved document's content hash — the publish bar's
   * "unpublished changes" comparison rides on it. */
  onSaved?: (contentHash: string) => void;
}) {
  const template = templateFor(templateId);
  const [document, setDocument] = useState(initialDocument);
  // One page is edited at a time. Multi-page documents exist in the schema
  // before the editor offers a switcher (ADR-0015), so this resolves to the
  // home page and the mutators below are already page-scoped — a mutator that
  // matched on section type alone would edit the same-named section on every
  // page at once the moment a second one appears.
  const activePage = document.pages.find((page) => page.path === HOME_PATH) ?? document.pages[0]!;
  const activePageId = activePage.id;
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  const isFirstRender = useRef(true);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSave({ status: "pending" });
    if (timer.current) clearTimeout(timer.current);
    const seq = ++saveSeq.current;
    timer.current = setTimeout(() => {
      setSave({ status: "saving" });
      void saveDraft(draftId, document)
        .then((result) => {
          if (seq !== saveSeq.current) return; // a newer edit superseded this save
          setSave(
            result.ok ? { status: "saved" } : { status: "error", detail: result.error.message },
          );
          if (result.ok) onSavedRef.current?.(result.data.contentHash);
        })
        // The action itself never throws, so a rejection means the request
        // never got an answer (server down, offline). Same chip, plain words.
        .catch(() => {
          if (seq !== saveSeq.current) return;
          setSave({
            status: "error",
            detail: "could not reach the server — edits stay here and the next change retries.",
          });
        });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [document, draftId]);

  const updateSite = useCallback((site: LooseContentDocumentV2["site"]) => {
    setDocument((doc) => ({ ...doc, site }));
  }, []);

  /** Every structural edit rewrites exactly one page's sections. */
  const editPage = useCallback(
    (pageId: string, edit: (sections: SectionInstance[]) => SectionInstance[]) => {
      setDocument((doc) => ({
        ...doc,
        pages: doc.pages.map((page) =>
          page.id === pageId ? { ...page, sections: edit(page.sections) } : page,
        ),
      }));
    },
    [],
  );

  const updateFields = useCallback(
    (pageId: string, type: string, fields: Record<string, unknown>) => {
      editPage(pageId, (sections) =>
        sections.map((section) => (section.type === type ? { ...section, fields } : section)),
      );
    },
    [editPage],
  );

  const toggleSection = useCallback(
    (pageId: string, type: string, enabled: boolean) => {
      editPage(pageId, (sections) =>
        sections.map((section) => (section.type === type ? { ...section, enabled } : section)),
      );
    },
    [editPage],
  );

  const moveSection = useCallback(
    (pageId: string, type: string, direction: -1 | 1) => {
      editPage(pageId, (sections) => {
        const index = sections.findIndex((section) => section.type === type);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= sections.length) return sections;
        const next = [...sections];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        return next;
      });
    },
    [editPage],
  );

  const addSection = useCallback(
    (pageId: string, type: string) => {
      const spec = template?.sections.find((candidate) => candidate.type === type);
      if (!spec) return;
      editPage(pageId, (sections) => [
        ...sections,
        { type, enabled: true, fields: emptyFieldsFor(spec) },
      ]);
    },
    [template, editPage],
  );

  if (!template) {
    return (
      <p className="text-muted-foreground text-sm">
        This workspace uses the unknown template “{templateId}” — register it in lib/templates.ts.
      </p>
    );
  }

  const presentTypes = new Set(activePage.sections.map((section) => section.type));
  const addableSections = template.sections.filter((spec) => !presentTypes.has(spec.type));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Content</h1>
          <p className="text-muted-foreground text-sm">
            Changes save automatically. Order here is the order on the site.
          </p>
        </div>
        <SaveStatus save={save} />
      </header>

      <SiteSettingsCard site={document.site} onChange={updateSite} />

      {activePage.sections.map((section, index) => {
        const spec = template.sections.find((candidate) => candidate.type === section.type);
        if (!spec) {
          return (
            <div
              key={`${activePageId}:${section.type}`}
              className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
            >
              “{section.type}” is not part of this template anymore; it will be ignored at publish.
            </div>
          );
        }
        return (
          <SectionCard
            // Keyed by page as well as type: SectionCard seeds react-hook-form
            // from `fields` at mount and is uncontrolled after, so swapping
            // pages without remounting would show the previous page's values
            // and immediately stream them upward over the new page's.
            key={`${activePageId}:${section.type}`}
            spec={spec}
            fields={(section.fields ?? {}) as Record<string, unknown>}
            enabled={section.enabled}
            canMoveUp={index > 0}
            canMoveDown={index < activePage.sections.length - 1}
            onFieldsChange={(fields) => updateFields(activePageId, section.type, fields)}
            onToggle={(enabled) => toggleSection(activePageId, section.type, enabled)}
            onMove={(direction) => moveSection(activePageId, section.type, direction)}
          />
        );
      })}

      {addableSections.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Add section</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addableSections.map((spec) => (
              <DropdownMenuItem
                key={spec.type}
                onSelect={() => addSection(activePageId, spec.type)}
              >
                {spec.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function SaveStatus({ save }: { save: SaveState }) {
  if (save.status === "idle") return null;
  if (save.status === "error") {
    return (
      <span className="text-destructive text-sm" role="status">
        Save failed — {save.detail}
      </span>
    );
  }
  const text =
    save.status === "pending" ? "Unsaved changes" : save.status === "saving" ? "Saving…" : "Saved";
  return (
    <span className="text-muted-foreground text-sm" role="status">
      {text}
    </span>
  );
}
