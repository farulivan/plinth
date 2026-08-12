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

  // Page SEO's `noindex` is the first boolean any schema-derived form has had
  // to render. Section manifests never needed one, so this threw at module
  // load and took the editor down with it.
  it("describes a boolean as a toggle", () => {
    const flags = defineSection("flags", z.object({ hidden: z.boolean().default(false) }));
    expect(describeSectionFields(flags)).toEqual([
      { kind: "toggle", name: "hidden", optional: false },
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

  // Numbers and enums are the two primitives collection entries introduced —
  // a project's year and its build status. Both would have thrown at module
  // load inside the eagerly-built template registry, which is the third time
  // that failure shape would have taken the whole editor down.
  it("describes a bounded number", () => {
    const spec = defineSection("spec", z.object({ year: z.number().int().min(2000).max(2100) }));
    expect(describeSectionFields(spec)).toEqual([
      { kind: "number", name: "year", optional: false, min: 2000, max: 2100 },
    ]);
  });

  it("describes an unbounded number without inventing limits", () => {
    const spec = defineSection("spec", z.object({ count: z.number() }));
    expect(describeSectionFields(spec)).toEqual([
      { kind: "number", name: "count", optional: false },
    ]);
  });

  // A closed set is a control, not a text box: typing a value the schema
  // rejects is a publish failure the author could not have seen coming.
  it("describes an enum as a select carrying its options", () => {
    const spec = defineSection("spec", z.object({ status: z.enum(["built", "in-studio"]) }));
    expect(describeSectionFields(spec)).toEqual([
      { kind: "select", name: "status", optional: false, options: ["built", "in-studio"] },
    ]);
  });

  // Everything object-shaped that is not a link or a mediaRef is a fieldset.
  // Treating an unrecognised object as an error would have made every grouped
  // field a change to this file.
  it("describes a plain object as a group of its own fields", () => {
    const spec = defineSection(
      "spec",
      z.object({ quote: z.object({ text: longText, author: shortText }).optional() }),
    );
    expect(describeSectionFields(spec)).toEqual([
      {
        kind: "group",
        name: "quote",
        optional: true,
        item: [
          { kind: "longText", name: "text", optional: false, maxLength: 5000 },
          { kind: "shortText", name: "author", optional: false, maxLength: 200 },
        ],
      },
    ]);
  });

  it("fails loudly on a primitive it does not know", () => {
    const rogue = defineSection("rogue", z.object({ when: z.date() }));
    expect(() => describeSectionFields(rogue)).toThrow(/No field descriptor for "when"/);
  });

  it("extracts the section type literal", () => {
    expect(sectionTypeOf(heroLike)).toBe("hero");
    expect(sectionTypeOf(projectsLike)).toBe("projects");
  });
});
