import { z } from "zod";
import { describe, expect, it } from "vitest";
import { describeSectionFields, sectionTypeOf } from "./describe";
import { link, longText, shortText } from "./fieldTypes";
import { mediaRef } from "./mediaRef";
import { defineSection } from "./section";

// Fixtures mirror the Norven manifest shapes without importing the template
// package — schema sits below templates in the layer graph and must not
// reach up, even from tests.
const heroLike = defineSection(
  "hero",
  z.object({ title: shortText, tagline: shortText.optional(), photo: mediaRef }),
);
const introLike = defineSection("intro", z.object({ heading: shortText, body: longText }));
const frameLike = defineSection(
  "frame",
  z.object({ heading: shortText, body: longText, cta: link }),
);
const projectsLike = defineSection(
  "projects",
  z.object({
    heading: shortText,
    items: z.array(z.object({ title: shortText, image: mediaRef })).min(1),
  }),
);

describe("describeSectionFields", () => {
  it("classifies strings by length budget", () => {
    expect(describeSectionFields(introLike)).toEqual([
      { kind: "shortText", name: "heading", optional: false, maxLength: 200 },
      { kind: "longText", name: "body", optional: false, maxLength: 5000 },
    ]);
  });

  it("detects optionality, media refs, and links", () => {
    expect(describeSectionFields(heroLike)).toEqual([
      { kind: "shortText", name: "title", optional: false, maxLength: 200 },
      { kind: "shortText", name: "tagline", optional: true, maxLength: 200 },
      { kind: "media", name: "photo", optional: false },
    ]);
    expect(describeSectionFields(frameLike).at(-1)).toEqual({
      kind: "link",
      name: "cta",
      optional: false,
    });
  });

  it("marks repeatable groups as arrays and describes their row shape", () => {
    expect(describeSectionFields(projectsLike).at(-1)).toEqual({
      kind: "array",
      name: "items",
      optional: false,
      item: [
        { kind: "shortText", name: "title", optional: false, maxLength: 200 },
        { kind: "media", name: "image", optional: false },
      ],
    });
  });

  it("refuses primitive arrays — rows must be objects", () => {
    const rogue = defineSection("rogue", z.object({ tags: z.array(shortText) }));
    expect(() => describeSectionFields(rogue)).toThrow(/must hold objects/);
  });

  it("fails loudly on a primitive it does not know", () => {
    const rogue = defineSection("rogue", z.object({ count: z.number() }));
    expect(() => describeSectionFields(rogue)).toThrow(/No field descriptor for "count"/);
  });

  it("extracts the section type literal", () => {
    expect(sectionTypeOf(heroLike)).toBe("hero");
    expect(sectionTypeOf(projectsLike)).toBe("projects");
  });
});
