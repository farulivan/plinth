"use client";

import {
  HOME_PATH,
  resolveEntryPath,
  type EntryInstance,
  type LooseContentDocumentV2,
  type SectionInstance,
} from "@plinth/schema";
import { Button } from "@plinth/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plinth/ui/components/dropdown-menu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyFieldsFor, emptyItemFor, templateFor, type TemplateSpec } from "@/lib/templates";
import { saveDraft } from "@/server/actions/drafts";
import { EntryCard } from "./entry-card";
import { RouteBar, type Selection } from "./route-bar";
import { SectionCard } from "./section-card";
import { SiteSettingsCard } from "./site-settings-card";

type SaveState =
  | { status: "idle" | "pending" | "saving" | "saved" }
  | { status: "error"; detail: string };

const AUTOSAVE_DEBOUNCE_MS = 500;

type Collections = Record<string, { pathTemplate: string; entries: EntryInstance[] }>;

/**
 * Every collection the TEMPLATE declares, carrying whatever entries the
 * document holds for it.
 *
 * Reading the document alone would mean a workspace that has never added a
 * project has no `projects` key, so the editor would offer no way to add the
 * first one — the collection unreachable for exactly the authors who had not
 * used it yet.
 *
 * Its caller wraps this in `useMemo`, which is load-bearing rather than an
 * optimisation. The React Compiler treats a call it cannot see into as capable
 * of mutating what it is passed, so calling this with state during render made
 * it give up on the whole component — every `useCallback` in this file lost
 * its memoisation, silently, and the lint rule was the only thing that said so.
 */
function declaredCollections(template: TemplateSpec | null, stored: Collections): Collections {
  const merged: Collections = {};
  for (const spec of template?.collections ?? []) {
    merged[spec.name] = stored[spec.name] ?? { pathTemplate: spec.pathTemplate, entries: [] };
  }
  return merged;
}

/**
 * The entry a selection names, or null when it names none — either because a
 * page is open, or because the entry was just removed.
 *
 * A module function rather than an inline expression: the compiler bails out
 * of optimising a whole component when it cannot analyse a function created in
 * render, and an IIFE here silently cost every `useCallback` in this file its
 * memoisation.
 */
function resolveEntry(
  collections: Collections,
  selection: Selection | null,
): { collection: string; entry: EntryInstance; pathTemplate: string } | null {
  if (selection?.kind !== "entry") return null;
  const collection = collections[selection.collection];
  const entry = collection?.entries.find((candidate) => candidate.id === selection.id);
  if (!entry || !collection) return null;
  return { collection: selection.collection, entry, pathTemplate: collection.pathTemplate };
}

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
  onPageChange,
}: {
  draftId: string;
  templateId: string;
  initialDocument: LooseContentDocumentV2;
  /** Fires with the saved document's content hash — the publish bar's
   * "unpublished changes" comparison rides on it. */
  onSaved?: (contentHash: string) => void;
  /** Fires with the path of the route being edited, so the preview follows it. */
  onPageChange?: (path: string) => void;
}) {
  const template = templateFor(templateId);
  const [document, setDocument] = useState(initialDocument);
  // One route is edited at a time; every section mutator below is scoped to
  // its page, because section types are unique per page rather than per
  // document (ADR-0015) and a mutator matching on type alone would edit the
  // same-named section on every page at once.
  //
  // A collection entry is a route too, so the selection is either — one
  // control, and no question about which of two switchers the preview follows.
  const [selection, setSelection] = useState<Selection | null>(null);
  const homePage = document.pages.find((page) => page.path === HOME_PATH) ?? document.pages[0]!;

  const collections = useMemo(
    () => declaredCollections(template, document.collections),
    [template, document.collections],
  );

  // Resolved rather than trusted, so removing the open route cannot strand the
  // editor on one that no longer exists.
  const activeEntry = resolveEntry(collections, selection);
  const activePage = activeEntry
    ? null
    : (document.pages.find((page) => page.id === selection?.id) ?? homePage);
  const activePageId = activePage?.id ?? homePage.id;

  const activeSelection: Selection = activeEntry
    ? { kind: "entry", collection: activeEntry.collection, id: activeEntry.entry.id }
    : { kind: "page", id: activePageId };
  const activePath = activeEntry
    ? resolveEntryPath(activeEntry.pathTemplate, activeEntry.entry.slug)
    : activePage!.path;
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  const isFirstRender = useRef(true);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  // Reported rather than derived by the parent: the active route falls back
  // when the selected one is removed, so the editor is the only place that
  // knows what is actually open. Entry paths follow their slug, so renaming a
  // project moves the preview with it.
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  });
  useEffect(() => {
    onPageChangeRef.current?.(activePath);
  }, [activePath]);

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

  const updatePage = useCallback(
    (pageId: string, patch: Partial<LooseContentDocumentV2["pages"][number]>) => {
      setDocument((doc) => ({
        ...doc,
        pages: doc.pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)),
      }));
    },
    [],
  );

  /** Every entry edit rewrites exactly one collection's list. */
  const editCollection = useCallback(
    (name: string, edit: (entries: EntryInstance[]) => EntryInstance[]) => {
      setDocument((doc) => {
        const collection = doc.collections[name];
        if (!collection) return doc;
        return {
          ...doc,
          collections: {
            ...doc.collections,
            [name]: { ...collection, entries: edit(collection.entries) },
          },
        };
      });
    },
    [],
  );

  const updateEntry = useCallback(
    (name: string, entryId: string, patch: Partial<EntryInstance>) => {
      editCollection(name, (entries) =>
        entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
      );
    },
    [editCollection],
  );

  const updateSeo = useCallback(
    (target: Selection, seo: LooseContentDocumentV2["pages"][number]["seo"]) => {
      if (target.kind === "page") updatePage(target.id, { seo });
      else updateEntry(target.collection, target.id, { seo });
    },
    [updatePage, updateEntry],
  );

  const toggleRoute = useCallback(
    (target: Selection, enabled: boolean) => {
      if (target.kind === "page") updatePage(target.id, { enabled });
      else updateEntry(target.collection, target.id, { enabled });
    },
    [updatePage, updateEntry],
  );

  const addPage = useCallback(() => {
    const id = crypto.randomUUID();
    setDocument((doc) => {
      // Paths must be unique, so a new page gets a free one rather than
      // colliding with an existing page and failing validation on creation.
      let n = doc.pages.length;
      let path = `/page-${String(n)}/`;
      while (doc.pages.some((page) => page.path === path)) path = `/page-${String(++n)}/`;
      return {
        ...doc,
        pages: [
          ...doc.pages,
          {
            id,
            path,
            navLabel: `Page ${String(n)}`,
            enabled: false,
            seo: { noindex: false },
            sections: [],
          },
        ],
      };
    });
    setSelection({ kind: "page", id });
  }, []);

  const removePage = useCallback((pageId: string) => {
    setDocument((doc) => {
      // min(1) on pages, and a site with no root is not a site.
      if (doc.pages.length <= 1) return doc;
      const target = doc.pages.find((page) => page.id === pageId);
      if (!target || target.path === HOME_PATH) return doc;
      return { ...doc, pages: doc.pages.filter((page) => page.id !== pageId) };
    });
    setSelection(null);
  }, []);

  const addEntry = useCallback(
    (name: string) => {
      const spec = template?.collections.find((candidate) => candidate.name === name);
      if (!spec) return;
      const id = crypto.randomUUID();
      setDocument((doc) => {
        const existing = doc.collections[name];
        // Slugs are unique within a collection and one resolves to a path, so
        // a new entry gets a free slug rather than colliding on creation.
        const entries = existing?.entries ?? [];
        let n = entries.length + 1;
        let slug = `untitled-${String(n)}`;
        while (entries.some((entry) => entry.slug === slug)) slug = `untitled-${String(++n)}`;
        return {
          ...doc,
          collections: {
            ...doc.collections,
            [name]: {
              // The template owns the path template; a document that has never
              // held this collection has none to reuse.
              pathTemplate: existing?.pathTemplate ?? spec.pathTemplate,
              // Preserved rather than reset: adding an entry must not silently
              // strip the spread every detail page in the collection ends on.
              closingSections: existing?.closingSections ?? [],
              entries: [
                ...entries,
                {
                  id,
                  slug,
                  // Created parked, like a new page: an empty project must not
                  // appear on the live index the moment it is created.
                  enabled: false,
                  seo: { noindex: false },
                  fields: emptyItemFor(spec.fields),
                },
              ],
            },
          },
        };
      });
      setSelection({ kind: "entry", collection: name, id });
    },
    [template],
  );

  const removeEntry = useCallback(
    (name: string, entryId: string) => {
      editCollection(name, (entries) => entries.filter((entry) => entry.id !== entryId));
      setSelection(null);
    },
    [editCollection],
  );

  const moveEntry = useCallback(
    (name: string, entryId: string, direction: -1 | 1) => {
      editCollection(name, (entries) => {
        const index = entries.findIndex((entry) => entry.id === entryId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= entries.length) return entries;
        const next = [...entries];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        return next;
      });
    },
    [editCollection],
  );

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

  const presentTypes = new Set(activePage?.sections.map((section) => section.type) ?? []);
  const addableSections = template.sections.filter((spec) => !presentTypes.has(spec.type));
  const entrySpec = activeEntry
    ? template.collections.find((spec) => spec.name === activeEntry.collection)
    : undefined;

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

      <RouteBar
        pages={document.pages}
        collections={collections}
        selection={activeSelection}
        onSelect={setSelection}
        onSeoChange={updateSeo}
        onToggle={toggleRoute}
        onAddPage={addPage}
        onRemovePage={removePage}
        onAddEntry={addEntry}
        onRemoveEntry={removeEntry}
        onMoveEntry={moveEntry}
      />

      {activeEntry && entrySpec ? (
        <EntryCard
          // Keyed on the entry for the reason every form here is keyed: it
          // seeds react-hook-form at mount and is uncontrolled after, so
          // switching entries without remounting would show the previous
          // project's values and stream them over the new one's.
          key={activeEntry.entry.id}
          spec={entrySpec}
          slug={activeEntry.entry.slug}
          fields={(activeEntry.entry.fields ?? {}) as Record<string, unknown>}
          onSlugChange={(slug) =>
            updateEntry(activeEntry.collection, activeEntry.entry.id, { slug })
          }
          onFieldsChange={(fields) =>
            updateEntry(activeEntry.collection, activeEntry.entry.id, { fields })
          }
        />
      ) : null}

      {(activePage?.sections ?? []).map((section, index) => {
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
            canMoveDown={index < (activePage?.sections.length ?? 0) - 1}
            onFieldsChange={(fields) => updateFields(activePageId, section.type, fields)}
            onToggle={(enabled) => toggleSection(activePageId, section.type, enabled)}
            onMove={(direction) => moveSection(activePageId, section.type, direction)}
          />
        );
      })}

      {activePage && addableSections.length > 0 ? (
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
