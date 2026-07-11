"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@plinth/ui/components/button";
import { Form } from "@plinth/ui/components/form";
import { Switch } from "@plinth/ui/components/switch";
import { useEffect, useRef } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import type { SectionSpec } from "@/lib/templates";
import { FieldControl } from "./field-controls";

/**
 * One section = one form (ADR-0001). The form is uncontrolled after mount
 * (defaultValues only) and streams every change upward; the editor root owns
 * the document, the debounce, and the save. Inline errors come from the
 * manifest schema via zodResolver but never block saving — drafts hold
 * half-typed content; publish is the strict gate (ADR-0007).
 */
export function SectionCard({
  spec,
  fields,
  enabled,
  canMoveUp,
  canMoveDown,
  onFieldsChange,
  onToggle,
  onMove,
}: {
  spec: SectionSpec;
  fields: Record<string, unknown>;
  enabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onFieldsChange: (fields: Record<string, unknown>) => void;
  onToggle: (enabled: boolean) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const form = useForm<FieldValues>({
    // The schema is only known at runtime (registry-driven), so the resolver
    // generic can't be statically satisfied — the descriptors keep the
    // controls and the schema in lockstep instead.
    resolver: zodResolver(spec.fieldsSchema as never),
    defaultValues: fields as FieldValues,
    mode: "onChange",
  });

  // Subscribe once (form.subscribe lives outside the render lifecycle, unlike
  // watch(callback)); keep the latest callback in a ref so parent re-renders
  // (every keystroke updates the document) don't churn the subscription.
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
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Show ${spec.label}`} />
          <h2
            className={
              enabled
                ? "text-sm font-semibold"
                : "text-muted-foreground text-sm font-semibold line-through"
            }
          >
            {spec.label}
          </h2>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            aria-label={`Move ${spec.label} up`}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            aria-label={`Move ${spec.label} down`}
          >
            ↓
          </Button>
        </div>
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
