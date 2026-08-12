import type { CollectionRendererMap, ComponentMap } from "@plinth/renderer";
import {
  describeObjectFields,
  describeSectionFields,
  sectionTypeOf,
  type FieldDescriptor,
} from "@plinth/schema/content";
import {
  norvenChrome,
  norvenCollectionFields,
  norvenCollections,
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

export interface CollectionSpec {
  name: string;
  /** The path an entry resolves to, e.g. `/projects/{slug}/`. */
  pathTemplate: string;
  /** The entry's field schema — the per-entry form's resolver. */
  fieldsSchema: z.ZodType;
  fields: FieldDescriptor[];
}

export interface TemplateSpec {
  label: string;
  document: z.ZodType;
  sections: SectionSpec[];
  /** Collections the template declares. A document may hold entries for any of
   * them; one it does not declare is rejected at publish. */
  collections: CollectionSpec[];
  /** Section React components for SSR rendering — preview now, publish later
   * (ADR-0007: one renderer for both). */
  components: ComponentMap;
  /** Detail components and entry summaries, per collection name. The preview
   * renders these too — a detail page that only existed in the published build
   * would be the one page an author could not see before shipping it. */
  collectionRenderers: CollectionRendererMap;
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

/** Where each collection's entries live on the site. Declared here rather than
 * read from the draft: a fresh workspace has no collections in its document
 * yet, and the first entry an author adds has to be given a path template from
 * somewhere. */
const NORVEN_PATH_TEMPLATES: Record<string, string> = { projects: "/projects/{slug}/" };

function toCollectionSpec(name: string, fields: z.ZodObject): CollectionSpec {
  return {
    name,
    pathTemplate: NORVEN_PATH_TEMPLATES[name] ?? `/${name}/{slug}/`,
    fieldsSchema: fields,
    fields: describeObjectFields(fields),
  };
}

export const templates: Record<string, TemplateSpec> = {
  "template-norven": {
    label: "Norven",
    document: norvenDocument,
    sections: norvenSection.options.map(toSectionSpec),
    collections: Object.entries(norvenCollectionFields).map(([name, fields]) =>
      toCollectionSpec(name, fields),
    ),
    components: norvenComponents,
    collectionRenderers: norvenCollections,
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
      case "select":
        // The first option, not blank: every value in the set is valid, so an
        // empty select would be the one state the schema rejects.
        values[descriptor.name] = descriptor.options[0];
        break;
      case "link":
        values[descriptor.name] = { label: "", href: "" };
        break;
      case "group":
        values[descriptor.name] = emptyValuesFor(descriptor.item);
        break;
      case "array":
        values[descriptor.name] = [];
        break;
      case "number":
      case "media":
        // Left absent. The media picker fills its whole object at once, and a
        // number has no blank that is also a valid value — seeding 0 would put
        // a year of 0 into a field nobody has touched. The publish gate flags
        // both if they are still missing.
        break;
    }
  }
  return values;
}
