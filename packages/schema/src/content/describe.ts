import type { z } from "zod";

/**
 * Schema → editor-form derivation (ADR-0001: the manifest schema IS the form
 * definition). The editor renders whatever this returns, so a template's
 * fields can never drift from their validation — and a new field primitive
 * fails loudly here until it gets a descriptor, instead of silently rendering
 * nothing.
 */

export type FieldDescriptor =
  | { kind: "shortText"; name: string; optional: boolean; maxLength: number }
  | { kind: "longText"; name: string; optional: boolean; maxLength: number }
  | { kind: "prose"; name: string; optional: boolean; maxLength: number }
  | { kind: "link"; name: string; optional: boolean }
  | { kind: "media"; name: string; optional: boolean }
  | { kind: "array"; name: string; optional: boolean; item: FieldDescriptor[] };

/** Keys `mediaRef` is recognised by. A subset check rather than an exact match:
 * the shape gains fields over time (ADR-0014 keeps signed URLs as a seam), and
 * under an exact match the first addition would fall through every branch and
 * throw at module load — inside the dashboard's template registry, which builds
 * every spec eagerly, so the whole editor would fail to render over a field
 * nobody had used yet. */
const MEDIA_REF_KEYS = ["alt", "contentHash", "height", "mediaId", "width"];

/** Strings up to this render as a single-line input; longer as a textarea. */
const LONG_TEXT_THRESHOLD = 500;

function unwrapOptional(schema: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = schema;
  let optional = false;
  while (inner.def.type === "optional" || inner.def.type === "default") {
    optional = inner.def.type === "optional" ? true : optional;
    inner = (inner as z.ZodOptional<z.ZodType> | z.ZodDefault<z.ZodType>).unwrap();
  }
  return { inner, optional };
}

function describeField(name: string, schema: z.ZodType): FieldDescriptor {
  const { inner, optional } = unwrapOptional(schema);

  if (inner.def.type === "string") {
    const maxLength = (inner as z.ZodString).maxLength ?? Number.MAX_SAFE_INTEGER;
    return maxLength <= LONG_TEXT_THRESHOLD
      ? { kind: "shortText", name, optional, maxLength }
      : { kind: "longText", name, optional, maxLength };
  }

  if (inner.def.type === "object") {
    const keys = Object.keys((inner as z.ZodObject).shape);
    if (MEDIA_REF_KEYS.every((key) => keys.includes(key))) {
      return { kind: "media", name, optional };
    }
    if (keys.length === 2 && keys.includes("href") && keys.includes("label")) {
      return { kind: "link", name, optional };
    }
  }

  if (inner.def.type === "array") {
    const element = (inner as z.ZodArray<z.ZodType>).element;
    // An array of strings is prose: paragraphs, one <p> each (ADR-0015).
    if (element.def.type === "string") {
      const maxLength = (element as z.ZodString).maxLength ?? Number.MAX_SAFE_INTEGER;
      return { kind: "prose", name, optional, maxLength };
    }
    if (element.def.type !== "object") {
      throw new Error(
        `Array field "${name}" must hold objects or strings — no other element ` +
          `type has an editor row shape.`,
      );
    }
    const item = Object.entries((element as z.ZodObject).shape).map(([itemName, itemSchema]) =>
      describeField(itemName, itemSchema as z.ZodType),
    );
    return { kind: "array", name, optional, item };
  }

  throw new Error(
    `No field descriptor for "${name}" (schema type "${inner.def.type}") — ` +
      `new primitives need a FieldDescriptor kind before the editor can render them.`,
  );
}

/**
 * Descriptors for one section schema as built by `defineSection` — the
 * object with `{ type, enabled, fields }`. Field order follows the manifest's
 * declaration order, which is the form's render order.
 */
export function describeSectionFields(section: z.ZodType): FieldDescriptor[] {
  const shape = (section as z.ZodObject).shape;
  const fields = shape["fields"];
  if (!fields || fields.def.type !== "object") {
    throw new Error("describeSectionFields expects a defineSection() schema with object fields.");
  }
  return describeObjectFields(fields as z.ZodObject);
}

/**
 * Descriptors for any object schema. Sections reach this through their
 * `fields` key above; page SEO and collection entries have no such wrapper and
 * describe their whole shape. One derivation for all three means a new field
 * primitive reaches every form at once, rather than the section editor and the
 * entry editor drifting apart.
 */
export function describeObjectFields(schema: z.ZodObject): FieldDescriptor[] {
  return Object.entries(schema.shape).map(([name, field]) =>
    describeField(name, field as z.ZodType),
  );
}

/** The `type` literal of a defineSection() schema. */
export function sectionTypeOf(section: z.ZodType): string {
  const typeSchema = (section as z.ZodObject).shape["type"];
  const value = (typeSchema as z.ZodLiteral<string>).def.values[0];
  if (typeof value !== "string") {
    throw new Error("defineSection() schemas carry a string literal type.");
  }
  return value;
}
