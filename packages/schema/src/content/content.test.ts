import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  defineContentDocument,
  defineSection,
  link,
  longText,
  looseContentDocument,
  mediaRef,
  type MediaRef,
  shortText,
} from "./index";

const UUID = "8c7a3c3e-2f6b-4e7a-9f7e-2b1a4d5e6f70";

describe("field primitives", () => {
  it("shortText trims and bounds", () => {
    expect(shortText.parse("  Salt House  ")).toBe("Salt House");
    expect(shortText.safeParse("").success).toBe(false);
    expect(shortText.safeParse("   ").success).toBe(false);
    expect(shortText.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("longText accepts prose and bounds at 5000", () => {
    expect(longText.parse("A paragraph.\n\nAnother.")).toContain("Another");
    expect(longText.safeParse("y".repeat(5001)).success).toBe(false);
  });

  it("link takes absolute URLs and site-relative paths, nothing else", () => {
    expect(link.parse({ label: "Work", href: "https://norven.example/work" }).href).toMatch(
      /^https:/,
    );
    expect(link.parse({ label: "Work", href: "/work" }).href).toBe("/work");
    expect(link.safeParse({ label: "Work", href: "work" }).success).toBe(false);
    expect(link.safeParse({ href: "/work" }).success).toBe(false);
  });
});

const MEDIA_REF = {
  mediaId: UUID,
  alt: "Coastal house at dusk",
  contentHash: "a".repeat(64),
  width: 1600,
  height: 1200,
};

describe("mediaRef", () => {
  it("requires the mediaId + alt pairing (the a11y floor)", () => {
    const valid = mediaRef.parse(MEDIA_REF);
    expect(valid.mediaId).toBe(UUID);
    expect(mediaRef.safeParse({ ...MEDIA_REF, alt: undefined }).success).toBe(false);
    expect(mediaRef.safeParse({ ...MEDIA_REF, alt: "  " }).success).toBe(false);
    expect(mediaRef.safeParse({ ...MEDIA_REF, mediaId: "not-a-uuid" }).success).toBe(false);
  });

  it("requires the frozen variant identity (ADR-0014)", () => {
    expect(mediaRef.safeParse({ ...MEDIA_REF, contentHash: "short" }).success).toBe(false);
    expect(mediaRef.safeParse({ ...MEDIA_REF, width: 0 }).success).toBe(false);
    expect(mediaRef.safeParse({ ...MEDIA_REF, height: -1 }).success).toBe(false);
  });

  it("infers the documented shape", () => {
    expectTypeOf<MediaRef>().toEqualTypeOf<{
      mediaId: string;
      alt: string;
      contentHash: string;
      width: number;
      height: number;
      widths?: number[] | undefined;
    }>();
  });

  // Optional, and it has to stay optional: every reference written before
  // widths were recorded is missing it, and those documents must keep parsing
  // for as long as their snapshots are retained.
  it("accepts a reference that records no widths", () => {
    expect(mediaRef.safeParse(MEDIA_REF).success).toBe(true);
    expect(mediaRef.parse(MEDIA_REF).widths).toBeUndefined();
  });

  it("refuses an empty width list, which would render no sources at all", () => {
    expect(mediaRef.safeParse({ ...MEDIA_REF, widths: [] }).success).toBe(false);
    expect(mediaRef.safeParse({ ...MEDIA_REF, widths: [400, 1366] }).success).toBe(true);
  });
});

describe("content documents", () => {
  const hero = defineSection("hero", z.object({ title: shortText, photo: mediaRef }));
  const intro = defineSection("intro", z.object({ body: longText }));
  const doc = defineContentDocument(z.discriminatedUnion("type", [hero, intro]));

  const heroInput = {
    type: "hero",
    fields: { title: "Salt House", photo: { ...MEDIA_REF, alt: "dusk facade" } },
  };

  it("round-trips and applies defaults (schemaVersion, enabled)", () => {
    const parsed = doc.parse({ sections: [heroInput] });
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sections[0]?.enabled).toBe(true);
  });

  it("discriminates section types and validates their fields", () => {
    const wrongFields = doc.safeParse({
      sections: [{ type: "intro", fields: { title: "not an intro field" } }],
    });
    expect(wrongFields.success).toBe(false);
  });

  it("rejects duplicate section types with a pathed issue", () => {
    const dup = doc.safeParse({ sections: [heroInput, heroInput] });
    expect(dup.success).toBe(false);
    if (!dup.success) {
      expect(dup.error.issues.some((i) => i.path.join(".") === "sections.1.type")).toBe(true);
    }
  });

  it("rejects an empty document", () => {
    expect(doc.safeParse({ sections: [] }).success).toBe(false);
  });

  it("loose envelope validates structure without template knowledge", () => {
    const loose = looseContentDocument.parse({
      sections: [{ type: "anything", fields: { whatever: true } }],
    });
    expect(loose.sections[0]?.type).toBe("anything");
  });
});
