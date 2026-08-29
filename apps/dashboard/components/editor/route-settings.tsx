"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  describeObjectFields,
  pageSeo,
  resolveEntryPath,
  type EntryInstance,
  type LooseContentDocumentV2,
} from "@plinth/schema/content";
import { Button } from "@plinth/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plinth/ui/components/collapsible";
import { Form } from "@plinth/ui/components/form";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { FieldControl } from "./field-controls";

type Page = LooseContentDocumentV2["pages"][number];
type Seo = Page["seo"];

/**
 * What the editor has open. A route rather than a page: a collection entry is
 * a page of the site too, and giving entries their own separate switcher would
 * have meant two controls whose combined state has to answer "so which one is
 * the preview showing?".
 */
export type Selection =
  | { kind: "page"; id: string }
  | { kind: "entry"; collection: string; id: string };

const seoDescriptors = describeObjectFields(pageSeo);

/**
 * Settings for the open route: the path the build will emit, ordering and
 * removal, and the discovery metadata form. Selection and the published
 * switch live in the outline rail now — this bar is what remains.
 *
 * The SEO form is keyed on the route id by its caller, for the same reason
 * SectionCard is: it seeds react-hook-form at mount and is uncontrolled after,
 * so a switch that reused a mounted form would show the previous route's
 * values and stream them back over the new one's.
 */
export function RouteSettings({
  pages,
  collections,
  selection,
  onSeoChange,
  onRemovePage,
  onRemoveEntry,
  onMoveEntry,
}: {
  pages: Page[];
  collections: Record<string, { pathTemplate: string; entries: EntryInstance[] }>;
  selection: Selection;
  onSeoChange: (selection: Selection, seo: Seo) => void;
  onRemovePage: (pageId: string) => void;
  onRemoveEntry: (collection: string, entryId: string) => void;
  onMoveEntry: (collection: string, entryId: string, direction: -1 | 1) => void;
}) {
  const active = resolve(pages, collections, selection);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground font-mono text-xs">{active.path}</span>

        {/* Reorder is a first-class control, not a nicety: array order is what
            prev/next walks and what an index renders (ADR-0015), so it is the
            only way to move a project in the sequence. */}
        {active.selection.kind === "entry" ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={active.index <= 0}
              onClick={() => onMoveEntry(collectionOf(active.selection), active.selection.id, -1)}
              aria-label="Move earlier in the sequence"
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={active.index >= active.count - 1}
              onClick={() => onMoveEntry(collectionOf(active.selection), active.selection.id, 1)}
              aria-label="Move later in the sequence"
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveEntry(collectionOf(active.selection), active.selection.id)}
            >
              <Trash2 />
              Remove {singular(collectionOf(active.selection))}
            </Button>
          </div>
        ) : /* The home page has no replacement: the site would have no root. */
        active.path !== "/" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onRemovePage(active.selection.id)}
          >
            <Trash2 />
            Remove page
          </Button>
        ) : null}
      </div>

      <SeoForm
        key={selectionValue(active.selection)}
        seo={active.seo}
        selection={active.selection}
        onChange={onSeoChange}
      />
    </div>
  );
}

function singular(collection: string): string {
  return collection.replace(/s$/, "");
}

/** A selection encoded as one string, for keying forms on the open route. */
function selectionValue(selection: Selection): string {
  return selection.kind === "page"
    ? `page:${selection.id}`
    : `entry:${selection.collection}:${selection.id}`;
}

/** Narrowing helper — the entry branch always has a collection. */
function collectionOf(selection: Selection): string {
  return selection.kind === "entry" ? selection.collection : "";
}

interface Resolved {
  selection: Selection;
  path: string;
  enabled: boolean;
  seo: Seo;
  index: number;
  count: number;
}

/**
 * The selection, falling back when it names something that no longer exists —
 * removing the open route must not strand the editor on it.
 */
function resolve(
  pages: Page[],
  collections: Record<string, { pathTemplate: string; entries: EntryInstance[] }>,
  selection: Selection,
): Resolved {
  if (selection.kind === "entry") {
    const collection = collections[selection.collection];
    const index = collection?.entries.findIndex((entry) => entry.id === selection.id) ?? -1;
    const entry = index >= 0 ? collection!.entries[index]! : undefined;
    if (entry && collection) {
      return {
        selection,
        path: resolveEntryPath(collection.pathTemplate, entry.slug),
        enabled: entry.enabled,
        seo: entry.seo,
        index,
        count: collection.entries.length,
      };
    }
  }

  const page = pages.find((candidate) => candidate.id === selection.id) ?? pages[0]!;
  return {
    selection: { kind: "page", id: page.id },
    path: page.path,
    enabled: page.enabled,
    seo: page.seo,
    index: 0,
    count: pages.length,
  };
}

function SeoForm({
  seo,
  selection,
  onChange,
}: {
  seo: Seo;
  selection: Selection;
  onChange: (selection: Selection, seo: Seo) => void;
}) {
  const form = useForm<FieldValues>({
    // Loose while typing, strict at publish (ADR-0007).
    resolver: zodResolver(pageSeo.partial()),
    defaultValues: seo as FieldValues,
    mode: "onChange",
  });

  // Latest callback in a ref so the parent re-rendering on every keystroke
  // does not churn the subscription — same reasoning as SectionCard.
  const latest = useRef({ selection, onChange });
  useEffect(() => {
    latest.current = { selection, onChange };
  });
  useEffect(() => {
    const subscription = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        latest.current.onChange(latest.current.selection, values as Seo);
      },
    });
    return subscription;
  }, [form]);

  return (
    <Collapsible>
      <CollapsibleTrigger className="text-muted-foreground text-sm underline-offset-4 hover:underline">
        Page settings — title, description, search visibility
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            {seoDescriptors.map((descriptor) => (
              <FieldControl key={descriptor.name} control={form.control} descriptor={descriptor} />
            ))}
          </form>
        </Form>
      </CollapsibleContent>
    </Collapsible>
  );
}
