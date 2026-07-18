"use client";

import type { FieldDescriptor } from "@plinth/schema/content";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plinth/ui/components/form";
import { Input } from "@plinth/ui/components/input";
import { Textarea } from "@plinth/ui/components/textarea";
import type { Control, FieldValues } from "react-hook-form";
import { MediaField } from "./media-field";

/** "cta" → "Cta", "heading" → "Heading". Field names are manifest-authored
 * identifiers; template packages own nicer labels when they need them. */
function labelFor(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function Label({ descriptor }: { descriptor: FieldDescriptor }) {
  return (
    <FormLabel>
      {labelFor(descriptor.name)}
      {descriptor.optional ? <span className="text-muted-foreground ml-1">(optional)</span> : null}
    </FormLabel>
  );
}

/** Renders the control a FieldDescriptor calls for — the runtime half of
 * ADR-0001's schema-driven form generation. */
export function FieldControl({
  control,
  descriptor,
}: {
  control: Control<FieldValues>;
  descriptor: FieldDescriptor;
}) {
  switch (descriptor.kind) {
    case "shortText":
      return (
        <FormField
          control={control}
          name={descriptor.name}
          render={({ field }) => (
            <FormItem>
              <Label descriptor={descriptor} />
              <FormControl>
                <Input
                  {...field}
                  value={typeof field.value === "string" ? field.value : ""}
                  maxLength={descriptor.maxLength}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    case "longText":
      return (
        <FormField
          control={control}
          name={descriptor.name}
          render={({ field }) => (
            <FormItem>
              <Label descriptor={descriptor} />
              <FormControl>
                <Textarea
                  {...field}
                  value={typeof field.value === "string" ? field.value : ""}
                  rows={5}
                  maxLength={descriptor.maxLength}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    case "link":
      return (
        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{labelFor(descriptor.name)}</legend>
          <FormField
            control={control}
            name={`${descriptor.name}.label`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Label</FormLabel>
                <FormControl>
                  <Input {...field} value={typeof field.value === "string" ? field.value : ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${descriptor.name}.href`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Link target</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={typeof field.value === "string" ? field.value : ""}
                    placeholder="https://… or /page"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
      );
    case "media":
      return (
        <MediaField control={control} name={descriptor.name} label={labelFor(descriptor.name)} />
      );
    case "array":
      return (
        <div className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          {labelFor(descriptor.name)} — repeatable items arrive with the editor completion pass.
        </div>
      );
  }
}
