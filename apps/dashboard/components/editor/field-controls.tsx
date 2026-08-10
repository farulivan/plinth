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
import { Switch } from "@plinth/ui/components/switch";
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
    case "toggle":
      return (
        <FormField
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch
                  checked={field.value === true}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              </FormControl>
              <Label descriptor={descriptor} name={descriptor.name} />
              <FormMessage />
            </FormItem>
          )}
        />
      );
    case "prose":
      return <ProseField control={control} descriptor={descriptor} name={name} />;
    case "media":
      return <MediaField control={control} name={name} label={labelFor(descriptor.name)} />;
    case "array":
      return <ArrayField control={control} descriptor={descriptor} name={name} />;
  }
}

/**
 * Body copy as paragraphs (ADR-0015). One textarea per paragraph rather than
 * one textarea split on blank lines: the stored shape is an array, and editing
 * a joined string would make every keystroke a re-split, so a stray blank line
 * would silently renumber every paragraph after it.
 */
function ProseField({
  control,
  descriptor,
  name,
}: {
  control: Control<FieldValues>;
  descriptor: Extract<FieldDescriptor, { kind: "prose" }>;
  name: string;
}) {
  const { fields, append, remove, swap } = useFieldArray({ control, name });

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{labelFor(descriptor.name)}</legend>
      {fields.map((row, index) => (
        <div key={row.id} className="space-y-2">
          <FormField
            control={control}
            name={`${name}.${index}`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-muted-foreground text-xs">
                  Paragraph {index + 1}
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={typeof field.value === "string" ? field.value : ""}
                    rows={4}
                    maxLength={descriptor.maxLength}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onClick={() => swap(index, index - 1)}
            >
              Move up
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === fields.length - 1}
              onClick={() => swap(index, index + 1)}
            >
              Move down
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => append("")}>
        Add paragraph
      </Button>
    </fieldset>
  );
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
