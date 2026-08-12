"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { slug as slugSchema } from "@plinth/schema/content";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plinth/ui/components/form";
import { Input } from "@plinth/ui/components/input";
import { useEffect, useRef } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { z } from "zod";
import type { CollectionSpec } from "@/lib/templates";
import { FieldControl } from "./field-controls";

const slugForm = z.object({ slug: slugSchema });

/**
 * One collection entry = one form, on the same terms as SectionCard: seeded
 * from `fields` at mount, uncontrolled after, streaming every change upward
 * while the editor root owns the document and the save. Inline errors come
 * from the manifest schema and never block saving — a half-written project is
 * savable and parked; publish is the strict gate (ADR-0007).
 *
 * The caller keys this on the entry id for the reason every form here is
 * keyed: switching entries without remounting would show the previous
 * project's values and immediately stream them over the new one's.
 */
export function EntryCard({
  spec,
  slug,
  fields,
  onSlugChange,
  onFieldsChange,
}: {
  spec: CollectionSpec;
  slug: string;
  fields: Record<string, unknown>;
  onSlugChange: (slug: string) => void;
  onFieldsChange: (fields: Record<string, unknown>) => void;
}) {
  const form = useForm<FieldValues>({
    resolver: zodResolver(spec.fieldsSchema as never),
    defaultValues: fields as FieldValues,
    mode: "onChange",
  });

  const onFieldsChangeRef = useRef(onFieldsChange);
  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange;
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        onFieldsChangeRef.current(values as Record<string, unknown>);
      },
    });
  }, [form]);

  return (
    <section className="rounded-lg border">
      <header className="border-b px-4 py-3">
        <SlugField slug={slug} onChange={onSlugChange} />
      </header>
      <Form {...form}>
        <form className="space-y-4 p-4" onSubmit={(event) => event.preventDefault()}>
          {spec.fields.map((descriptor) => (
            <FieldControl key={descriptor.name} control={form.control} descriptor={descriptor} />
          ))}
        </form>
      </Form>
    </section>
  );
}

/**
 * The slug is its own form, not a field of the entry's.
 *
 * It belongs to the entry envelope rather than to the template's fields, and
 * it is the one value here that changes a published URL — validating it
 * against the slug rule as it is typed is the difference between an inline
 * message and a failed publish.
 */
function SlugField({ slug, onChange }: { slug: string; onChange: (slug: string) => void }) {
  const form = useForm<FieldValues>({
    resolver: zodResolver(slugForm.partial()),
    defaultValues: { slug },
    mode: "onChange",
  });

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const next = (values as { slug?: unknown }).slug;
        if (typeof next === "string") onChangeRef.current(next);
      },
    });
  }, [form]);

  return (
    <Form {...form}>
      <form onSubmit={(event) => event.preventDefault()}>
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={typeof field.value === "string" ? field.value : ""}
                  placeholder="salt-house"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
