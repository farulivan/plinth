import type { CollectionRendererMap } from "@plinth/renderer";
import { ProjectDetail } from "./ProjectDetail";
import { summarizeProject } from "./summarize";

/**
 * How Norven renders and describes each of its collections. Keys match the
 * collection names in the manifest's document schema, the same way
 * `norvenComponents` keys match section `type` literals.
 */
export const norvenCollections: CollectionRendererMap = {
  projects: { Detail: ProjectDetail, summarize: summarizeProject },
};
