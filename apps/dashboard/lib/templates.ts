import type { ComponentMap } from "@plinth/renderer";
import { describeSectionFields, sectionTypeOf, type FieldDescriptor } from "@plinth/schema/content";
import { norvenComponents, norvenDocument, norvenSection } from "@plinth/template-norven";
import type { z } from "zod";

/**
 * Template registry: workspaces.template_id → the manifest the editor renders
 * (ADR-0001). Section specs are derived from the zod schemas at module load,
 * so the form and the validation are one artifact. Adding a template is one
 * entry here once its package exists.
 */

export interface SectionSpec {
  type: string;
  label: string;
  /** Whole section schema — publish-grade validation. */
  schema: z.ZodType;
  /** Just the fields object — the per-section form's resolver. */
  fieldsSchema: z.ZodType;
  fields: FieldDescriptor[];
}

export interface TemplateSpec {
  label: string;
  document: z.ZodType;
  sections: SectionSpec[];
  /** Section React components for SSR rendering — preview now, publish later
   * (ADR-0007: one renderer for both). */
  components: ComponentMap;
}

function humanize(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function toSectionSpec(section: z.ZodType): SectionSpec {
  const type = sectionTypeOf(section);
  return {
    type,
    label: humanize(type),
    schema: section,
    fieldsSchema: (section as z.ZodObject).shape["fields"] as z.ZodType,
    fields: describeSectionFields(section),
  };
}

export const templates: Record<string, TemplateSpec> = {
  "template-norven": {
    label: "Norven",
    document: norvenDocument,
    sections: norvenSection.options.map(toSectionSpec),
    components: norvenComponents,
  },
};

export function templateFor(templateId: string): TemplateSpec | null {
  return templates[templateId] ?? null;
}

/** Blank field values for a freshly added section. Loose-savable as a draft;
 * the form surfaces the required-field errors inline until they're filled. */
export function emptyFieldsFor(spec: SectionSpec): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const descriptor of spec.fields) {
    if (descriptor.optional) continue;
    switch (descriptor.kind) {
      case "shortText":
      case "longText":
        fields[descriptor.name] = "";
        break;
      case "link":
        fields[descriptor.name] = { label: "", href: "" };
        break;
      case "array":
        fields[descriptor.name] = [];
        break;
      case "media":
        // No media library yet (ADR-0006) — leave absent; the form shows the
        // placeholder and publish-grade validation flags it.
        break;
    }
  }
  return fields;
}
