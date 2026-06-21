import type { ComponentType } from "react";
import type { SectionInstance } from "@plinth/schema/content";

/**
 * Props every section component receives. The renderer is template-agnostic,
 * so the section's `fields` arrive unvalidated (`unknown`); a template's
 * component narrows them with its own manifest schema before rendering.
 */
export interface SectionComponentProps {
  section: SectionInstance;
}

/** A component that renders a single document section. */
export type SectionComponent = ComponentType<SectionComponentProps>;

/**
 * Maps a section `type` to the component that renders it. A template provides
 * exactly one map; the renderer dispatches each section through it. Unknown
 * types render nothing, so a document authored against a newer manifest stays
 * forward-compatible (ADR-0001).
 */
export type ComponentMap = Record<string, SectionComponent>;
