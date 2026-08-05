import { z } from "zod";
import { describe, expect, it } from "vitest";
import { describeSectionFields, sectionTypeOf } from "./describe";
import { link, longText, prose, shortText } from "./fieldTypes";
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

  // A standalone link is matched by shape, but inside an array the element is
  // destructured and `href` — a union of an absolute URL and a site-relative
  // path — arrives on its own. That threw until site settings introduced the
  // first array of links.
  it("describes an array of links, whose href is a union", () => {
    const nav = defineSection("nav", z.object({ items: z.array(link) }));
    expect(describeSectionFields(nav)).toEqual([
      {
        kind: "array",
        name: "items",
        optional: false,
        item: [
          { kind: "shortText", name: "label", optional: false, maxLength: 200 },
          { kind: "shortText", name: "href", optional: false, maxLength: 500 },
        ],
      },
    ]);
  });

  it("describes a string array as prose — paragraphs, not rows", () => {
    const body = defineSection("body", z.object({ paragraphs: prose }));
    expect(describeSectionFields(body)).toEqual([
      { kind: "prose", name: "paragraphs", optional: false, maxLength: 5000 },
    ]);
  });

  it("still refuses an array of anything else — no editor row shape exists", () => {
    const rogue = defineSection("rogue", z.object({ counts: z.array(z.number()) }));
    expect(() => describeSectionFields(rogue)).toThrow(/must hold objects or strings/);
  });

  // The exact-key check this replaced would have thrown here, at module load
  // inside the dashboard's eagerly-built template registry — taking the whole
  // editor down over a field nobody had used yet.
  it("recognises a mediaRef that has gained a field", () => {
    const extended = defineSection(
      "extended",
      z.object({ photo: mediaRef.extend({ widths: z.array(z.number()).optional() }) }),
    );
    expect(describeSectionFields(extended)).toEqual([
      { kind: "media", name: "photo", optional: false },
    ]);
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
