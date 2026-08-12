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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@plinth/ui/components/select";
import { Switch } from "@plinth/ui/components/switch";
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

/** A selection encoded for one <Select>, which only speaks strings. */
export function selectionValue(selection: Selection): string {
  return selection.kind === "page"
    ? `page:${selection.id}`
    : `entry:${selection.collection}:${selection.id}`;
}

function parseSelection(value: string): Selection | null {
  const [kind, ...rest] = value.split(":");
  if (kind === "page" && rest[0]) return { kind: "page", id: rest[0] };
  if (kind === "entry" && rest[0] && rest[1]) {
    return { kind: "entry", collection: rest[0], id: rest[1] };
  }
  return null;
}

const seoDescriptors = describeObjectFields(pageSeo);

/**
 * Route selection and per-route settings: what the editor is editing, its
 * discovery metadata, and whether it is published at all.
 *
 * The SEO form is keyed on the route id by its caller, for the same reason
 * SectionCard is: it seeds react-hook-form at mount and is uncontrolled after,
 * so a switch that reused a mounted form would show the previous route's
 * values and stream them back over the new one's.
 */
export function RouteBar({
  pages,
  collections,
  selection,
  onSelect,
  onSeoChange,
  onToggle,
  onAddPage,
  onRemovePage,
  onAddEntry,
  onRemoveEntry,
  onMoveEntry,
}: {
  pages: Page[];
  collections: Record<string, { pathTemplate: string; entries: EntryInstance[] }>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onSeoChange: (selection: Selection, seo: Seo) => void;
  onToggle: (selection: Selection, enabled: boolean) => void;
  onAddPage: () => void;
  onRemovePage: (pageId: string) => void;
  onAddEntry: (collection: string) => void;
  onRemoveEntry: (collection: string, entryId: string) => void;
  onMoveEntry: (collection: string, entryId: string, direction: -1 | 1) => void;
}) {
  const active = resolve(pages, collections, selection);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectionValue(active.selection)}
          onValueChange={(value) => {
            const next = parseSelection(value);
            if (next) onSelect(next);
          }}
        >
          <SelectTrigger className="w-72" aria-label="Page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Pages</SelectLabel>
              {pages.map((page) => (
                <SelectItem key={page.id} value={selectionValue({ kind: "page", id: page.id })}>
                  {page.navLabel ?? page.path}
                  {page.enabled ? "" : " (hidden)"}
                </SelectItem>
              ))}
            </SelectGroup>
            {Object.entries(collections).map(([name, collection]) => (
              <SelectGroup key={name}>
                <SelectLabel className="capitalize">{name}</SelectLabel>
                {collection.entries.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={selectionValue({ kind: "entry", collection: name, id: entry.id })}
                  >
                    {entry.slug}
                    {entry.enabled ? "" : " (hidden)"}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground font-mono text-xs">{active.path}</span>

        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch
            checked={active.enabled}
            onCheckedChange={(enabled) => onToggle(active.selection, enabled)}
            aria-label="Published"
          />
          Published
        </label>

        {/* Reorder is a first-class control, not a nicety: array order is what
            prev/next walks and what an index renders (ADR-0015), so it is the
            only way to move a project in the sequence. */}
        {active.selection.kind === "entry" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={active.index <= 0}
              onClick={() => onMoveEntry(collectionOf(active.selection), active.selection.id, -1)}
              aria-label="Move earlier in the sequence"
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={active.index >= active.count - 1}
              onClick={() => onMoveEntry(collectionOf(active.selection), active.selection.id, 1)}
              aria-label="Move later in the sequence"
            >
              ↓
            </Button>
          </>
        ) : null}

        <Button type="button" variant="outline" size="sm" onClick={onAddPage}>
          Add page
        </Button>
        {Object.keys(collections).map((name) => (
          <Button
            key={name}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddEntry(name)}
          >
            Add {singular(name)}
          </Button>
        ))}

        {active.selection.kind === "entry" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemoveEntry(collectionOf(active.selection), active.selection.id)}
          >
            Remove {singular(collectionOf(active.selection))}
          </Button>
        ) : /* The home page has no replacement: the site would have no root. */
        active.path !== "/" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemovePage(active.selection.id)}
          >
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
