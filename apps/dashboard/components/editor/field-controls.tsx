"use client";

import type { FieldDescriptor } from "@plinth/schema/content";
import { Button } from "@plinth/ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plinth/ui/components/form";
import { Input } from "@plinth/ui/components/input";
import { Textarea } from "@plinth/ui/components/textarea";
import { useFieldArray, type Control, type FieldValues } from "react-hook-form";
import { emptyItemFor } from "@/lib/templates";
import { MediaField } from "./media-field";

/** "cta" → "Cta", "heading" → "Heading". Field names are manifest-authored
 * identifiers; template packages own nicer labels when they need them. */
function labelFor(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function Label({ descriptor, name }: { descriptor: FieldDescriptor; name: string }) {
  return (
    <FormLabel>
      {labelFor(name)}
      {descriptor.optional ? <span className="text-muted-foreground ml-1">(optional)</span> : null}
    </FormLabel>
  );
}

/**
 * Renders the control a FieldDescriptor calls for — the runtime half of
 * ADR-0001's schema-driven form generation. `name` is the form path, which
 * differs from descriptor.name inside array rows (`items.2.title`).
 */
export function FieldControl({
  control,
  descriptor,
  name = descriptor.name,
}: {
  control: Control<FieldValues>;
  descriptor: FieldDescriptor;
  name?: string;
}) {
  switch (descriptor.kind) {
    case "shortText":
      return (
        <FormField
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem>
              <Label descriptor={descriptor} name={descriptor.name} />
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
          name={name}
          render={({ field }) => (
            <FormItem>
              <Label descriptor={descriptor} name={descriptor.name} />
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
            name={`${name}.label`}
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
            name={`${name}.href`}
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
      return <MediaField control={control} name={name} label={labelFor(descriptor.name)} />;
    case "array":
      return <ArrayField control={control} descriptor={descriptor} name={name} />;
  }
}

/**
 * Repeatable rows (ADR-0001: array order IS render order). Each row is the
 * item's descriptors rendered at an indexed path; add/remove/reorder mutate
 * the same form state the autosave watches, so structure changes save like
 * any keystroke.
 */
function ArrayField({
  control,
  descriptor,
  name,
}: {
  control: Control<FieldValues>;
  descriptor: FieldDescriptor & { kind: "array" };
  name: string;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name });

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{labelFor(descriptor.name)}</legend>
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">No {descriptor.name} yet — add the first.</p>
      ) : null}
      {fields.map((row, index) => (
        <div key={row.id} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-medium">#{index + 1}</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={`Move item ${index + 1} up`}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={`Move item ${index + 1} down`}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                aria-label={`Remove item ${index + 1}`}
              >
                ✕
              </Button>
            </div>
          </div>
          {descriptor.item.map((itemDescriptor) => (
            <FieldControl
              key={itemDescriptor.name}
              control={control}
              descriptor={itemDescriptor}
              name={`${name}.${index}.${itemDescriptor.name}`}
            />
          ))}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append(emptyItemFor(descriptor.item))}
      >
        Add {descriptor.name.replace(/s$/, "")}
      </Button>
    </fieldset>
  );
}
