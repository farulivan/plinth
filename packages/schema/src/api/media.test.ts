import { describe, expect, it } from "vitest";
import {
  LEGACY_MEDIA_VARIANT_WIDTHS,
  MEDIA_VARIANT_WIDTHS,
  legacyVariantWidths,
  mediaVariantWidths,
  variantWidthsFor,
} from "./media";

describe("variant width sets", () => {
  // The legacy set is a claim about bytes that already exist in R2, not a
  // preference. Editing it would make the renderer request variants for
  // pre-recording uploads that were never generated — every one a 404, on
  // published pages nobody is rebuilding.
  it("freezes the legacy set", () => {
    expect(LEGACY_MEDIA_VARIANT_WIDTHS).toEqual([400, 800, 1200, 1600]);
  });

  it("carries 1366 — the width Lighthouse desktop actually paints", () => {
    expect(MEDIA_VARIANT_WIDTHS).toContain(1366);
  });

  it("stays ascending, so the last entry is the largest", () => {
    // MediaRef picks `widths.at(-1)` for the <img> fallback src.
    const sorted = [...MEDIA_VARIANT_WIDTHS].sort((a, b) => a - b);
    expect([...MEDIA_VARIANT_WIDTHS]).toEqual(sorted);
  });

  it("only extends the legacy set — an existing width must never move", () => {
    // A superset means one re-encode pass can converge old media onto the new
    // set. Renaming 1600 to 1601 would instead orphan every legacy object.
    for (const width of LEGACY_MEDIA_VARIANT_WIDTHS) {
      expect(MEDIA_VARIANT_WIDTHS).toContain(width);
    }
  });
});

describe("mediaVariantWidths", () => {
  it("never upscales", () => {
    expect(mediaVariantWidths(1500)).toEqual([400, 800, 1200, 1366]);
  });

  it("gives a tiny original one variant under the smallest width's name", () => {
    expect(mediaVariantWidths(120)).toEqual([400]);
  });

  it("emits the full set for a large original", () => {
    expect(mediaVariantWidths(6240)).toEqual([400, 800, 1200, 1366, 1600, 1920]);
  });
});

describe("variantWidthsFor", () => {
  it("trusts the widths a reference records", () => {
    expect(variantWidthsFor({ width: 6240, widths: [400, 800] })).toEqual([400, 800]);
  });

  // The case the whole design exists for. A reference picked before widths
  // were recorded has four objects in R2; today's constant would have the
  // renderer ask for six.
  it("falls back to the legacy rule when a reference records nothing", () => {
    expect(variantWidthsFor({ width: 6240 })).toEqual([400, 800, 1200, 1600]);
    expect(variantWidthsFor({ width: 6240 })).not.toContain(1920);
  });

  it("applies the no-upscale rule to the fallback too", () => {
    expect(legacyVariantWidths(1000)).toEqual([400, 800]);
    expect(variantWidthsFor({ width: 1000 })).toEqual([400, 800]);
  });
});
