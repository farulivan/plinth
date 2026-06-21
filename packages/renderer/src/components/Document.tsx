import type { LooseContentDocument } from "@plinth/schema/content";
import type { ComponentMap } from "../componentMap";
import { Section } from "./Section";

interface DocumentProps {
  document: LooseContentDocument;
  components: ComponentMap;
}

/**
 * Renders a content document — its sections in array order (ADR-0001: array
 * position is render order). Per-section enable/unknown-type handling lives in
 * <Section>. Section types are unique per document, so `type` is a stable key.
 */
export function Document({ document, components }: DocumentProps) {
  return (
    <>
      {document.sections.map((section) => (
        <Section key={section.type} section={section} components={components} />
      ))}
    </>
  );
}
