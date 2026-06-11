import { z } from "zod";

/**
 * Section envelope. Tenants get exactly two structural freedoms (ADR-0001):
 * toggling a section and reordering sections. Array position is render
 * order; there is no separate `order` field to drift from it.
 */
export const sectionBase = z.object({
  type: z.string().min(1),
  enabled: z.boolean().default(true),
});

/** Section envelope with template-defined fields left unvalidated — used by
 * layers that handle documents without template knowledge (db snapshots,
 * api pre-checks) before the template's own schema runs. */
export const sectionInstance = sectionBase.extend({ fields: z.unknown() });
export type SectionInstance = z.infer<typeof sectionInstance>;

/** Builds one section's schema for a template manifest:
 * `defineSection("hero", z.object({ title: shortText, photo: mediaRef }))` */
export function defineSection<const TType extends string, TFields extends z.ZodType>(
  type: TType,
  fields: TFields,
) {
  return z.object({
    type: z.literal(type),
    enabled: z.boolean().default(true),
    fields,
  });
}

/**
 * Wraps a template's section union into its document schema.
 *
 * `schemaVersion` is the migration discriminant (ADR-0001's additive-with-
 * default playbook keys off it). Sections are unique by type — repeatable
 * sections would change the editor's structural-freedom contract and need
 * their own ADR first.
 */
export function defineContentDocument<TSection extends z.ZodType<{ type: string }>>(
  sections: TSection,
) {
  return z.object({
    schemaVersion: z.literal(1).default(1),
    sections: z
      .array(sections)
      .min(1)
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        for (const [index, item] of items.entries()) {
          if (seen.has(item.type)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "type"],
              message: `duplicate section type "${item.type}" — sections are unique per document`,
            });
          }
          seen.add(item.type);
        }
      }),
  });
}

/** Template-agnostic document envelope (fields stay unknown) — the shape the
 * db layer stores and the api validates before template resolution. */
export const looseContentDocument = defineContentDocument(sectionInstance);
export type LooseContentDocument = z.infer<typeof looseContentDocument>;
