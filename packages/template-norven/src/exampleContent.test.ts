import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MEDIA_VARIANT_FORMATS, mediaVariantWidths } from "@plinth/schema/api";
import { describe, expect, it } from "vitest";
import { norvenDocument } from "./manifest";

/**
 * The fixture's media is committed bytes; the srcset a build emits is derived
 * live from `mediaVariantWidths` (see MediaRef). Nothing links the two, so a
 * change to MEDIA_VARIANT_WIDTHS silently leaves the fixture asking for
 * variants that were never generated.
 *
 * That failure is invisible where it matters: the missing variants 404, the
 * page renders without its images, and Lighthouse reports *better* numbers
 * than production would — a quality gate passing because it stopped measuring
 * anything. These assertions turn that into a verify failure that names the
 * fix.
 */

const ROOT = join(import.meta.dirname, "..", "example-content");
const document = norvenDocument.parse(JSON.parse(readFileSync(join(ROOT, "norven.json"), "utf8")));

/** Every mediaRef in the document, wherever it is nested — the same depth-
 * independent walk the orphaned-media reaper does over serialized JSON. */
function mediaRefs(value: unknown): { contentHash: string; width: number; alt: string }[] {
  if (Array.isArray(value)) return value.flatMap(mediaRefs);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["mediaId"] === "string" && typeof record["contentHash"] === "string") {
      return [record as unknown as { contentHash: string; width: number; alt: string }];
    }
    return Object.values(record).flatMap(mediaRefs);
  }
  return [];
}

const refs = mediaRefs(document);

describe("example-content fixture", () => {
  it("references media at all", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs.map((ref) => [ref.alt, ref] as const))(
    "has every variant the renderer will request for %s",
    (_alt, ref) => {
      const expected = mediaVariantWidths(ref.width).flatMap((width) =>
        MEDIA_VARIANT_FORMATS.map((format) => `w${width}.${format}`),
      );
      const missing = expected.filter(
        (file) => !existsSync(join(ROOT, "media", ref.contentHash, file)),
      );

      expect(
        missing,
        `${ref.contentHash.slice(0, 12)}… is missing ${missing.length} variant(s). ` +
          `The width or format set changed since the fixture was generated — ` +
          `regenerate it with \`pnpm example-content\` and commit the result.`,
      ).toEqual([]);
    },
  );
});
