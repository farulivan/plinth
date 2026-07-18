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
  | { kind: "link"; name: string; optional: boolean }
  | { kind: "media"; name: string; optional: boolean }
  | { kind: "array"; name: string; optional: boolean };

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
    const keys = Object.keys((inner as z.ZodObject).shape).sort();
    if (keys.join(",") === "alt,contentHash,height,mediaId,width") {
      return { kind: "media", name, optional };
    }
    if (keys.join(",") === "href,label") return { kind: "link", name, optional };
  }

  if (inner.def.type === "array") return { kind: "array", name, optional };

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
  return Object.entries((fields as z.ZodObject).shape).map(([name, schema]) =>
    describeField(name, schema as z.ZodType),
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
