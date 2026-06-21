import type { ComponentMap } from "@plinth/renderer";
import { Frame } from "./Frame";
import { Hero } from "./Hero";
import { Intro } from "./Intro";
import { Projects } from "./Projects";

/**
 * Binds Norven section types to their components — the map the renderer's
 * <Section>/<Document> dispatch each document section through. Keys match the
 * manifest's section `type` literals.
 */
export const norvenComponents: ComponentMap = {
  hero: Hero,
  intro: Intro,
  projects: Projects,
  frame: Frame,
};
