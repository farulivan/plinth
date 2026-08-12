import type { ComponentMap } from "@plinth/renderer";
import { Contact } from "./Contact";
import { FeaturedProjects } from "./FeaturedProjects";
import { PhotoHero } from "./PhotoHero";
import { ProjectIndex } from "./ProjectIndex";
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
  projectIndex: ProjectIndex,
};
