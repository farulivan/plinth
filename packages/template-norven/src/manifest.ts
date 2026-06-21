import { z } from "zod";
import {
  defineContentDocument,
  defineSection,
  link,
  longText,
  mediaRef,
  shortText,
} from "@plinth/schema/content";

/**
 * Norven template manifest — the field vocabulary for tenant #0 (an
 * architecture studio site). Each section composes @plinth/schema field
 * primitives; the editor renders these as form controls and a publish must
 * satisfy this schema (ADR-0001). Sections are unique per document and offer
 * toggle + reorder only — no free placement, no rich text.
 */

export const heroSection = defineSection(
  "hero",
  z.object({
    title: shortText,
    tagline: shortText.optional(),
    photo: mediaRef,
  }),
);

export const introSection = defineSection(
  "intro",
  z.object({
    heading: shortText,
    body: longText,
  }),
);

export const projectsSection = defineSection(
  "projects",
  z.object({
    heading: shortText,
    items: z
      .array(
        z.object({
          title: shortText,
          summary: longText,
          image: mediaRef,
        }),
      )
      .min(1)
      .max(12),
  }),
);

export const frameSection = defineSection(
  "frame",
  z.object({
    heading: shortText,
    body: longText,
    cta: link,
  }),
);

/** Discriminated union of every Norven section, keyed on `type`. */
export const norvenSection = z.discriminatedUnion("type", [
  heroSection,
  introSection,
  projectsSection,
  frameSection,
]);

/** The Norven content document — what the editor edits and a publish renders. */
export const norvenDocument = defineContentDocument(norvenSection);
export type NorvenDocument = z.infer<typeof norvenDocument>;

/** Per-section field types, consumed by the section components (8.5). */
export type HeroFields = z.infer<typeof heroSection>["fields"];
export type IntroFields = z.infer<typeof introSection>["fields"];
export type ProjectsFields = z.infer<typeof projectsSection>["fields"];
export type FrameFields = z.infer<typeof frameSection>["fields"];
