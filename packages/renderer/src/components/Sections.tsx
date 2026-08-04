import type { SectionInstance } from "@plinth/schema/content";
import type { ComponentMap } from "../componentMap";
import { Section } from "./Section";

interface SectionsProps {
  sections: SectionInstance[];
  components: ComponentMap;
}

/**
 * Renders one page's sections in array order (ADR-0001: array position is
 * render order). Per-section enable and unknown-type handling lives in
 * <Section>.
 *
 * This takes a section list rather than a whole document because a document
 * now holds many pages and a collection entry holds none at all (ADR-0015) —
 * the renderer stays the piece that turns sections into elements, and page and
 * site composition belong to the surface that knows about `<head>`.
 *
 * Section types are unique within a page, so `type` is a stable key. Across
 * pages it is not, which is why callers rendering more than one page at a time
 * key the pages themselves by id.
 */
export function Sections({ sections, components }: SectionsProps) {
  return (
    <>
      {sections.map((section) => (
        <Section key={section.type} section={section} components={components} />
      ))}
    </>
  );
}
