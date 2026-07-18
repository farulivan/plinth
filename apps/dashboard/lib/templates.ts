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
  return emptyValuesFor(spec.fields);
}

/** Blank values for one array row — same rules, scoped to the item shape. */
export function emptyItemFor(item: FieldDescriptor[]): Record<string, unknown> {
  return emptyValuesFor(item);
}

function emptyValuesFor(descriptors: FieldDescriptor[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const descriptor of descriptors) {
    if (descriptor.optional) continue;
    switch (descriptor.kind) {
      case "shortText":
      case "longText":
        values[descriptor.name] = "";
        break;
      case "link":
        values[descriptor.name] = { label: "", href: "" };
        break;
      case "array":
        values[descriptor.name] = [];
        break;
      case "media":
        // Left absent: the picker fills the whole object at once, and the
        // publish gate flags a missing image.
        break;
    }
  }
  return values;
}
