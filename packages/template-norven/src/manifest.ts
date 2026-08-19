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
          /**
           * Where the card leads. Optional, and authored rather than derived
           * from the projects collection: a featured card can point at a
           * case study, an external write-up, or nothing at all, and matching
           * on title to find an entry would break the moment one is renamed.
           */
          href: z.union([z.url(), z.string().startsWith("/")]).optional(),
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
 * The contact form, separate from the `contact` section rather than folded
 * into it. The landing page ends on contact details as a call to action and
 * has no form; the contact page carries the form and the same details beside
 * it. One section doing both would mean the home page rendering a form it
 * does not want, or a flag deciding which half appears.
 *
 * Field labels are the names Web3Forms puts in the delivered email, so they
 * are editable copy rather than identifiers.
 */
export const contactFormSection = defineSection(
  "contactForm",
  z.object({
    eyebrow: shortText.optional(),
    heading: longText,
    /** Sits above the fields — Norven's portfolio disclosure lives here. */
    note: longText.optional(),
    /** Where a visitor is told to write if the submission fails. Distinct from
     * the `contact` section's address on purpose: this one has to be an inbox
     * that is actually monitored, and it is read out in an error message. */
    fallbackEmail: shortText,
    projectTypes: z
      .array(z.object({ label: shortText }))
      .min(1)
      .max(12),
    submitLabel: shortText,
    successMessage: longText,
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

/* -------------------------------------------------------------------------- */
/* Interior pages                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The masthead of a page that is not the landing page. `photoHero` carries a
 * photograph and fills the viewport; this is type alone, so an interior page
 * opens without asking an author to find an image for it.
 *
 * `title` breaks on newlines, the same convention `photoHero` uses.
 */
export const pageHeroSection = defineSection(
  "pageHero",
  z.object({
    eyebrow: shortText,
    title: longText,
    subtitle: longText.optional(),
  }),
);

/**
 * A stack of short essays under one label — the studio's philosophy, and the
 * shape any "here is how we think" block takes.
 */
export const principlesSection = defineSection(
  "principles",
  z.object({
    eyebrow: shortText,
    items: z
      .array(z.object({ heading: shortText, body: longText }))
      .min(1)
      .max(8),
  }),
);

/**
 * What the practice offers. The icon is an enum rather than a free string
 * because the drawings are inline SVG the template owns — a typo would render
 * an empty box, and an author has no way to know which names exist.
 */
export const practiceSection = defineSection(
  "practice",
  z.object({
    eyebrow: shortText,
    /** Breaks on a newline; the second line renders muted. */
    heading: longText,
    intro: longText,
    items: z
      .array(
        z.object({
          title: shortText,
          description: longText,
          icon: z.enum(["compass", "rule", "leaf", "book"]),
        }),
      )
      .min(1)
      .max(6),
  }),
);

/** How a project runs, phase by phase. */
export const processSection = defineSection(
  "process",
  z.object({
    eyebrow: shortText,
    heading: longText,
    items: z
      .array(
        z.object({
          /** "01" — rendered as "Phase 01", so it is copy rather than an index. */
          code: shortText,
          title: shortText,
          duration: shortText,
          description: longText,
        }),
      )
      .min(1)
      .max(8),
  }),
);

/** The people. Portraits are optional so the section is usable before anyone
 * has been photographed, which is the state every new tenant starts in. */
export const peopleSection = defineSection(
  "people",
  z.object({
    eyebrow: shortText,
    items: z
      .array(
        z.object({
          name: shortText,
          role: shortText,
          base: shortText,
          bio: longText,
          portrait: mediaRef.optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
);

/** Awards and citations — a year, a name, and where it came from. */
export const recognitionSection = defineSection(
  "recognition",
  z.object({
    eyebrow: shortText,
    items: z
      .array(z.object({ year: shortText, title: shortText, detail: shortText }))
      .min(1)
      .max(20),
  }),
);

/** Offices, on ink. */
export const locationsSection = defineSection(
  "locations",
  z.object({
    eyebrow: shortText,
    items: z
      .array(
        z.object({
          city: shortText,
          address: shortText,
          country: shortText,
          hours: shortText.optional(),
        }),
      )
      .min(1)
      .max(6),
  }),
);

/**
 * The essay part of a page: several headed blocks of paragraphs.
 *
 * A list of blocks rather than one block per section, because section types
 * are unique per page (ADR-0015) and the colophon needs three. That constraint
 * is load-bearing — the editor's mutators match on type — so it shapes the
 * content model rather than bending to it, and the result is arguably the
 * better one: "the prose on this page" is a thing, and its blocks reorder
 * together.
 */
export const proseSection = defineSection(
  "prose",
  z.object({
    blocks: z
      .array(
        z.object({
          eyebrow: shortText,
          heading: longText,
          body: prose,
          /** Tints the block, so consecutive ones do not read as one. */
          tone: z.enum(["bone", "bone2"]),
        }),
      )
      .min(1)
      .max(10),
  }),
);

/**
 * A decisions table: one row per layer of the stack, what was chosen, and
 * why. Three columns rather than prose because the value is in scanning it.
 */
export const stackSection = defineSection(
  "stack",
  z.object({
    eyebrow: shortText,
    heading: longText,
    rows: z
      .array(z.object({ layer: shortText, choice: shortText, note: longText }))
      .min(1)
      .max(24),
  }),
);

export const norvenSection = z.discriminatedUnion("type", [
  photoHeroSection,
  statementSection,
  featuredProjectsSection,
  statsSection,
  testimonialSection,
  contactSection,
  contactFormSection,
  projectIndexSection,
  pageHeroSection,
  principlesSection,
  practiceSection,
  processSection,
  peopleSection,
  recognitionSection,
  locationsSection,
  proseSection,
  stackSection,
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
export type ContactFormFields = z.infer<typeof contactFormSection>["fields"];
export type PageHeroFields = z.infer<typeof pageHeroSection>["fields"];
export type PrinciplesFields = z.infer<typeof principlesSection>["fields"];
export type PracticeFields = z.infer<typeof practiceSection>["fields"];
export type ProcessFields = z.infer<typeof processSection>["fields"];
export type PeopleFields = z.infer<typeof peopleSection>["fields"];
export type RecognitionFields = z.infer<typeof recognitionSection>["fields"];
export type LocationsFields = z.infer<typeof locationsSection>["fields"];
export type ProseFields = z.infer<typeof proseSection>["fields"];
export type StackFields = z.infer<typeof stackSection>["fields"];
