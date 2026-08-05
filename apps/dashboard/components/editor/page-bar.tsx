"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { describeObjectFields, pageSeo, type LooseContentDocumentV2 } from "@plinth/schema/content";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plinth/ui/components/select";
import { Switch } from "@plinth/ui/components/switch";
import { useEffect } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { FieldControl } from "./field-controls";

type Page = LooseContentDocumentV2["pages"][number];

const seoDescriptors = describeObjectFields(pageSeo);

/**
 * Page selection and per-page settings: which page the editor is editing, its
 * discovery metadata, and whether it is published at all.
 *
 * The SEO form is keyed on the page id by its caller, for the same reason
 * SectionCard is: it seeds react-hook-form at mount and is uncontrolled after,
 * so a page switch that reused a mounted form would show the previous page's
 * values and stream them back over the new page's.
 */
export function PageBar({
  pages,
  activePageId,
  onSelect,
  onSeoChange,
  onToggle,
  onAdd,
  onRemove,
}: {
  pages: Page[];
  activePageId: string;
  onSelect: (pageId: string) => void;
  onSeoChange: (pageId: string, seo: Page["seo"]) => void;
  onToggle: (pageId: string, enabled: boolean) => void;
  onAdd: () => void;
  onRemove: (pageId: string) => void;
}) {
  const active = pages.find((page) => page.id === activePageId) ?? pages[0]!;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={active.id} onValueChange={onSelect}>
          <SelectTrigger className="w-64" aria-label="Page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pages.map((page) => (
              <SelectItem key={page.id} value={page.id}>
                {page.navLabel ?? page.path}
                {page.enabled ? "" : " (hidden)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground font-mono text-xs">{active.path}</span>

        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch
            checked={active.enabled}
            onCheckedChange={(enabled) => onToggle(active.id, enabled)}
            aria-label="Published"
          />
          Published
        </label>

        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          Add page
        </Button>
        {/* The home page has no replacement: the site would have no root. */}
        {active.path !== "/" ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(active.id)}>
            Remove page
          </Button>
        ) : null}
      </div>

      <PageSeoForm key={active.id} page={active} onChange={onSeoChange} />
    </div>
  );
}

function PageSeoForm({
  page,
  onChange,
}: {
  page: Page;
  onChange: (pageId: string, seo: Page["seo"]) => void;
}) {
  const form = useForm<FieldValues>({
    // Loose while typing, strict at publish (ADR-0007).
    resolver: zodResolver(pageSeo.partial()),
    defaultValues: page.seo as FieldValues,
    mode: "onChange",
  });

  useEffect(() => {
    const subscription = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        onChange(page.id, values as Page["seo"]);
      },
    });
    return subscription;
  }, [form, onChange, page.id]);

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
