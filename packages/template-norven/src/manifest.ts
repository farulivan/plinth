import { z } from "zod";
import {
  defineContentDocument,
  defineSection,
  longText,
  mediaRef,
  shortText,
} from "@plinth/schema/content";

/**
 * The Norven template manifest v2 (M6 content port): the six sections of the
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

export const norvenSection = z.discriminatedUnion("type", [
  photoHeroSection,
  statementSection,
  featuredProjectsSection,
  statsSection,
  testimonialSection,
  contactSection,
]);

export const norvenDocument = defineContentDocument(norvenSection);
export type NorvenDocument = z.infer<typeof norvenDocument>;

export type PhotoHeroFields = z.infer<typeof photoHeroSection>["fields"];
export type StatementFields = z.infer<typeof statementSection>["fields"];
export type FeaturedProjectsFields = z.infer<typeof featuredProjectsSection>["fields"];
export type StatsFields = z.infer<typeof statsSection>["fields"];
export type TestimonialFields = z.infer<typeof testimonialSection>["fields"];
export type ContactFields = z.infer<typeof contactSection>["fields"];
