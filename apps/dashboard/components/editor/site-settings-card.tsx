"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { describeObjectFields, siteSettings, type SiteSettings } from "@plinth/schema/content";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plinth/ui/components/collapsible";
import { Form } from "@plinth/ui/components/form";
import { useEffect } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { FieldControl } from "./field-controls";

/**
 * Site-wide settings: the name and description the head falls back to, the nav
 * a page renders, and the footer.
 *
 * Same schema-driven derivation the section forms use (ADR-0001), reached
 * through `describeObjectFields` rather than the section variant because this
 * shape has no `fields` wrapper to unwrap.
 *
 * Collapsed by default. It is edited once and then rarely, so it should not
 * sit above the content an author opened the editor to change.
 */
const descriptors = describeObjectFields(siteSettings);

export function SiteSettingsCard({
  site,
  onChange,
}: {
  site: SiteSettings;
  onChange: (site: SiteSettings) => void;
}) {
  const form = useForm<FieldValues>({
    // Loose while typing, strict at publish (ADR-0007): an author mid-edit has
    // an empty field, and refusing to save it would lose their work.
    resolver: zodResolver(siteSettings.partial()),
    defaultValues: site as FieldValues,
    mode: "onChange",
  });

  useEffect(() => {
    const subscription = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        onChange(values as SiteSettings);
      },
    });
    return subscription;
  }, [form, onChange]);

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left">
        <span className="font-medium">Site settings</span>
        <span className="text-muted-foreground text-sm">
          Name, description, navigation and footer
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t p-4">
        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            {descriptors.map((descriptor) => (
              <FieldControl key={descriptor.name} control={form.control} descriptor={descriptor} />
            ))}
          </form>
        </Form>
      </CollapsibleContent>
    </Collapsible>
  );
}
