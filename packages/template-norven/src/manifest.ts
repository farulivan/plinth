import { z } from "zod";
import {
  collectionInstanceFor,
  contentDocumentFor,
  defineSection,
  longText,
  mediaRef,
  prose,
  shortText,
} from "@plinth/schema/content";

/**
 * The Norven template manifest v2: the six sections of the
 * real landing page, replacing the four foundation stubs. Field notes:
 * headings that break across lines carry "\n" (longText renders a textarea;
 * components split on it), and multi-part captions ("Residence · 2023 ·
 * Built") are single editable strings — the CMS edits copy, not taxonomy.
 */

export const photoHeroSection = defineSection(
  "photoHero",
  z.object({
    eyebrow: shortText.optional(),
    title: longText,
    subtitle: longText.optional(),
    photo: mediaRef,
  }),
);

export const statementSection = defineSection(
  "statement",
  z.object({
    eyebrow: shortText,
    body: longText,
  }),
);

export const featuredProjectsSection = defineSection(
  "featuredProjects",
  z.object({
    heading: shortText,
    items: z
      .array(
        z.object({
          title: shortText,
          /** e.g. "Residence · 2023 · Built" */
          meta: shortText,
          /** e.g. "Tjøme, Norway · 280 m²" */
          location: shortText,
          brief: longText,
          image: mediaRef,
        }),
      )
      .min(1)
      .max(8),
  }),
);

export const statsSection = defineSection(
  "stats",
  z.object({
    items: z
      .array(
        z.object({
          /** Numeric strings animate as counters; anything else renders as-is. */
          value: shortText,
          label: shortText,
        }),
      )
      .min(2)
      .max(4),
  }),
);

export const testimonialSection = defineSection(
  "testimonial",
  z.object({
    /** e.g. "Client, Salt House" */
    attribution: shortText,
    /** e.g. "Tjøme · 2023" */
    context: shortText,
    quote: longText,
    /** e.g. "Margrét Sól" — rendered with the leading dash. */
    name: shortText,
  }),
);

export const contactSection = defineSection(
  "contact",
  z.object({
    eyebrow: shortText,
    heading: longText,
    email: shortText,
    phone: shortText.optional(),
    studios: z
      .array(
        z.object({
          city: shortText,
          address: shortText,
        }),
      )
      .min(1)
      .max(5)
      .optional(),
  }),
);

/**
 * The index of a collection, rendered as a section so it sits in a page's
 * section list like any other — reorderable, with its own heading, on a page
 * that can carry an intro above it. `collection` names which one; the builder
 * resolves the entries and the component only draws links.
 */
export const projectIndexSection = defineSection(
  "projectIndex",
  z.object({
    eyebrow: shortText.optional(),
    heading: shortText,
    /** The collection to list. A union of one today, and a union rather than a
     * free string so the editor offers a picker instead of asking an author to
     * recall an internal name. */
    collection: z.enum(["projects"]).default("projects"),
  }),
);

export const norvenSection = z.discriminatedUnion("type", [
  photoHeroSection,
  statementSection,
  featuredProjectsSection,
  statsSection,
  testimonialSection,
  contactSection,
  projectIndexSection,
]);

/**
 * One project's detail page (ADR-0015).
 *
 * `year`, `kind` and `status` are separate fields here where `featuredProjects`
 * keeps a single "Residence · 2023 · Built" caption. The caption is display
 * copy and nothing reads it; these are read twice over — the component
 * composes the same eyebrow from them, and the page's CreativeWork JSON-LD
 * needs a real `dateCreated` and a real name for the work's kind. A search
 * engine cannot split a bullet-separated string, and inventing a parser for
 * one would be a taxonomy the CMS pretends not to have.
 */
export const projectEntryFields = z.object({
  title: shortText,
  year: z.number().int().min(1900).max(2100),
  kind: z.enum(["Residence", "Cultural", "Commercial", "Civic", "Landscape"]),
  status: z.enum(["Built", "In Studio"]),
  location: shortText,
  area: shortText,
  brief: longText,
  cover: mediaRef,
  /** Paragraphs, not markdown (ADR-0015) — the body of the project write-up. */
  body: prose,
  gallery: z
    .array(z.object({ image: mediaRef, caption: shortText.optional() }))
    .max(12)
    .default([]),
  testimonial: z.object({ quote: longText, author: shortText, role: shortText }).optional(),
});
export type ProjectEntryFields = z.infer<typeof projectEntryFields>;

/** Entry field schemas by collection name — what the publish gate validates
 * against and what the editor builds an entry form from. */
export const norvenCollectionFields = { projects: projectEntryFields };

/** The template's strict document schema: pages of Norven sections, plus the
 * collections that fan out into a page each (ADR-0015). */
export const norvenDocument = contentDocumentFor(norvenSection, {
  projects: collectionInstanceFor(projectEntryFields),
});
export type NorvenDocument = z.infer<typeof norvenDocument>;

export type PhotoHeroFields = z.infer<typeof photoHeroSection>["fields"];
export type StatementFields = z.infer<typeof statementSection>["fields"];
export type FeaturedProjectsFields = z.infer<typeof featuredProjectsSection>["fields"];
export type StatsFields = z.infer<typeof statsSection>["fields"];
export type TestimonialFields = z.infer<typeof testimonialSection>["fields"];
export type ContactFields = z.infer<typeof contactSection>["fields"];
