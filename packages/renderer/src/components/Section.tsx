import type { SectionInstance } from "@plinth/schema/content";
import type { ComponentMap, ResolvedCollections } from "../componentMap";

interface SectionProps {
  section: SectionInstance;
  components: ComponentMap;
  collections?: ResolvedCollections;
}

/**
 * Dispatches one section to its template component. Renders nothing for a
 * disabled section or an unknown type — the latter keeps a document authored
 * against a newer manifest forward-compatible (ADR-0001).
 */
export function Section({ section, components, collections }: SectionProps) {
  if (!section.enabled) return null;
  const Component = components[section.type];
  if (!Component) return null;
  return <Component section={section} collections={collections} />;
}
