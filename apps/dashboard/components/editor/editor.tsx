"use client";

import type { LooseContentDocument } from "@plinth/schema";
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
}: {
  draftId: string;
  templateId: string;
  initialDocument: LooseContentDocument;
}) {
  const template = templateFor(templateId);
  const [document, setDocument] = useState(initialDocument);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  const isFirstRender = useRef(true);

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

  const updateFields = useCallback((type: string, fields: Record<string, unknown>) => {
    setDocument((doc) => ({
      ...doc,
      sections: doc.sections.map((section) =>
        section.type === type ? { ...section, fields } : section,
      ),
    }));
  }, []);

  const toggleSection = useCallback((type: string, enabled: boolean) => {
    setDocument((doc) => ({
      ...doc,
      sections: doc.sections.map((section) =>
        section.type === type ? { ...section, enabled } : section,
      ),
    }));
  }, []);

  const moveSection = useCallback((type: string, direction: -1 | 1) => {
    setDocument((doc) => {
      const index = doc.sections.findIndex((section) => section.type === type);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= doc.sections.length) return doc;
      const sections = [...doc.sections];
      const [moved] = sections.splice(index, 1);
      sections.splice(target, 0, moved!);
      return { ...doc, sections };
    });
  }, []);

  const addSection = useCallback(
    (type: string) => {
      const spec = template?.sections.find((candidate) => candidate.type === type);
      if (!spec) return;
      setDocument((doc) => ({
        ...doc,
        sections: [...doc.sections, { type, enabled: true, fields: emptyFieldsFor(spec) }],
      }));
    },
    [template],
  );

  if (!template) {
    return (
      <p className="text-muted-foreground text-sm">
        This workspace uses the unknown template “{templateId}” — register it in lib/templates.ts.
      </p>
    );
  }

  const presentTypes = new Set(document.sections.map((section) => section.type));
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

      {document.sections.map((section, index) => {
        const spec = template.sections.find((candidate) => candidate.type === section.type);
        if (!spec) {
          return (
            <div
              key={section.type}
              className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
            >
              “{section.type}” is not part of this template anymore; it will be ignored at publish.
            </div>
          );
        }
        return (
          <SectionCard
            key={section.type}
            spec={spec}
            fields={(section.fields ?? {}) as Record<string, unknown>}
            enabled={section.enabled}
            canMoveUp={index > 0}
            canMoveDown={index < document.sections.length - 1}
            onFieldsChange={(fields) => updateFields(section.type, fields)}
            onToggle={(enabled) => toggleSection(section.type, enabled)}
            onMove={(direction) => moveSection(section.type, direction)}
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
              <DropdownMenuItem key={spec.type} onSelect={() => addSection(spec.type)}>
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
