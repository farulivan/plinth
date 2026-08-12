import { describeObjectFields, describeSectionFields } from "@plinth/schema/content";
import { describe, expect, it } from "vitest";
import { norvenCollectionFields, norvenSection } from "./manifest";
import { norvenComponents } from "./sections";

/**
 * The editor derives its forms from these schemas at module load, inside a
 * registry that builds every spec eagerly. A field primitive with no
 * descriptor therefore does not fail where it is used — it throws while the
 * module graph is still evaluating and takes the entire editor page down, so
 * the symptom is "no Publish button" and the cause is a schema three packages
 * away.
 *
 * That has now happened three times: a union inside an array of links, a
 * boolean on page SEO, and a number plus an enum on a project entry. Each was
 * found by an end-to-end run going red on a missing button. Asserting it here
 * turns the same mistake into a named failure in `pnpm verify`, before a
 * browser is involved.
 */
describe("manifest", () => {
  it.each(norvenSection.options.map((section) => [sectionName(section), section] as const))(
    "describes every field of the %s section",
    (_name, section) => {
      expect(() => describeSectionFields(section)).not.toThrow();
    },
  );

  it.each(Object.entries(norvenCollectionFields))(
    "describes every field of the %s collection entry",
    (_name, fields) => {
      expect(() => describeObjectFields(fields)).not.toThrow();
    },
  );

  // The other half of the same contract: a section the editor can add but the
  // renderer cannot draw produces a blank space on the published page, which
  // is invisible until someone looks at the live site.
  it("has a component for every section type", () => {
    for (const section of norvenSection.options) {
      expect(norvenComponents[sectionName(section)]).toBeDefined();
    }
  });
});

function sectionName(section: (typeof norvenSection)["options"][number]): string {
  return section.shape.type.def.values[0] as string;
}
