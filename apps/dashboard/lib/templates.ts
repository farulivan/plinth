import type { ComponentMap } from "@plinth/renderer";
import { describeSectionFields, sectionTypeOf, type FieldDescriptor } from "@plinth/schema/content";
import {
  norvenChrome,
  norvenComponents,
  norvenDocument,
  norvenSection,
} from "@plinth/template-norven";
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
  /** Nav and footer. The preview renders them too: chrome that appeared only
   * in the published build would make the preview a different page from the
   * one it claims to show (ADR-0015). */
  chrome: typeof norvenChrome;
}

/** "photoHero" → "Photo hero". Manifest types are camelCase identifiers. */
function humanize(type: string): string {
  const spaced = type.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
    chrome: norvenChrome,
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
      case "prose":
        // One empty paragraph, not zero: the schema requires min(1), and an
        // empty array would fail validation before the author had a control
        // to type into.
        values[descriptor.name] = [""];
        break;
      case "toggle":
        values[descriptor.name] = false;
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
