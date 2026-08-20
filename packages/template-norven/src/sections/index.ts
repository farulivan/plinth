import type { ComponentMap } from "@plinth/renderer";
import { Contact } from "./Contact";
import { ContactForm } from "./ContactForm";
import { FeaturedProjects } from "./FeaturedProjects";
import { Locations } from "./Locations";
import { PageHero } from "./PageHero";
import { People } from "./People";
import { PhotoHero } from "./PhotoHero";
import { Practice } from "./Practice";
import { Principles } from "./Principles";
import { Process } from "./Process";
import { DotMap } from "./DotMap";
import { ProjectIndex } from "./ProjectIndex";
import { Prose } from "./Prose";
import { Recognition } from "./Recognition";
import { Stack } from "./Stack";
import { Statement } from "./Statement";
import { Stats } from "./Stats";
import { Testimonial } from "./Testimonial";

/**
 * Binds Norven section types to their components — the map the renderer's
 * <Section>/<Document> dispatch each document section through. Keys match the
 * manifest's section `type` literals.
 */
export const norvenComponents: ComponentMap = {
  photoHero: PhotoHero,
  statement: Statement,
  featuredProjects: FeaturedProjects,
  stats: Stats,
  testimonial: Testimonial,
  contact: Contact,
  contactForm: ContactForm,
  projectIndex: ProjectIndex,
  dotMap: DotMap,
  pageHero: PageHero,
  principles: Principles,
  practice: Practice,
  process: Process,
  people: People,
  recognition: Recognition,
  locations: Locations,
  prose: Prose,
  stack: Stack,
};
