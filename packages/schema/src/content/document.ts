import { z } from "zod";

import { collectionInstanceFor } from "./collection";
import { pageInstanceFor, siteSettings } from "./page";
import { sectionInstance } from "./section";

/**
 * The content document, version 2: site settings, an ordered list of pages,
 * and named collections that fan out into a page each (ADR-0015).
 *
 * v1 was a single `sections[]` array — one page, no head, no chrome. It is
 * still parsed and upgraded on read, and always will be: `content_versions`
 * snapshots are immutable, `rollbackToVersion` accepts any retained version,
 * and the reaper keeps ten per workspace plus the live one, so a rollback can
 * select a v1 snapshot and must render it without a rebuild. Deleting this
 * branch would turn that rollback into a failed build (docs/migrations.md).
 */

export const DOCUMENT_SCHEMA_VERSION = 2;

/** Where v1's sections land when a v1 document is upgraded. */
export const HOME_PATH = "/";
/** Stable so an upgrade is deterministic: re-upgrading the same v1 snapshot
 * twice yields byte-identical output, which keeps `contentHash` stable across
 * reads and stops the preview channel seeing phantom changes. */
const HOME_PAGE_ID = "00000000-0000-4000-8000-000000000000";

export function contentDocumentFor<TSection extends z.ZodType<{ type: string }>, TEntries>(
  section: TSection,
  collections: TEntries extends Record<string, z.ZodType> ? TEntries : Record<string, never>,
) {
  return z.object({
    schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION).default(DOCUMENT_SCHEMA_VERSION),
    site: siteSettings,
    pages: z.array(pageInstanceFor(section)).min(1).superRefine(uniqueByPath),
    collections: z
      .object(collections as Record<string, z.ZodType>)
      .partial()
      .default({}),
  });
}

/** Two pages at one path resolve to one R2 object; the second would silently
 * overwrite the first at upload time, which reads as a page that did not
 * publish rather than as a conflict. */
export function uniqueByPath(items: { path: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.path)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "path"],
        message: `duplicate page path "${item.path}" — one page per path`,
      });
    }
    seen.add(item.path);
  }
}

/* -------------------------------------------------------------------------- */
/* Template-agnostic shapes                                                     */
/* -------------------------------------------------------------------------- */

/** v2 with template fields left unvalidated — what the db stores and the api
 * pre-checks before a template's own schema runs. */
export const looseContentDocumentV2 = z.object({
  schemaVersion: z.literal(2),
  site: siteSettings,
  pages: z.array(pageInstanceFor(sectionInstance)).min(1).superRefine(uniqueByPath),
  collections: z.record(z.string(), collectionInstanceFor(z.unknown())).default({}),
});
export type LooseContentDocumentV2 = z.infer<typeof looseContentDocumentV2>;

/** v1: one page's worth of sections and nothing else. Frozen — it describes
 * documents already written, so it never gains a field. */
export const looseContentDocumentV1 = z.object({
  schemaVersion: z.literal(1).default(1),
  sections: z.array(sectionInstance).min(1),
});
export type LooseContentDocumentV1 = z.infer<typeof looseContentDocumentV1>;

/**
 * Lift a v1 document into v2.
 *
 * Site settings have no v1 source, so they are seeded blank and the publish
 * gate asks for them. That is deliberate: inventing a plausible site name from
 * a workspace slug would produce a title tag nobody chose and nobody notices
 * until it is indexed.
 */
export function upgradeV1toV2(document: LooseContentDocumentV1): LooseContentDocumentV2 {
  return {
    schemaVersion: 2,
    site: { name: "", description: "", nav: [], social: [] },
    pages: [
      {
        id: HOME_PAGE_ID,
        path: HOME_PATH,
        enabled: true,
        seo: { noindex: false },
        sections: document.sections,
      },
    ],
    collections: {},
  };
}

/**
 * The one entry point for reading a stored document. Every read goes through
 * it and every write emits v2 — a read path that parses the raw row sees an
 * older shape and quietly behaves differently from one that upgrades, and the
 * preview channel compares hashes across both (docs/migrations.md).
 */
export const storedContentDocument = z
  .union([looseContentDocumentV2, looseContentDocumentV1])
  .transform((document) => (document.schemaVersion === 2 ? document : upgradeV1toV2(document)));

export function parseContentDocument(value: unknown): LooseContentDocumentV2 {
  return storedContentDocument.parse(value);
}

export function safeParseContentDocument(value: unknown) {
  return storedContentDocument.safeParse(value);
}

/** What a column holds: either version, before upgrading. */
export type StoredContentDocument = LooseContentDocumentV1 | LooseContentDocumentV2;
