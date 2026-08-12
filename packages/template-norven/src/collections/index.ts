import type { EntryComponentMap } from "@plinth/renderer";
import { ProjectDetail } from "./ProjectDetail";

/**
 * Binds a collection name to the component that renders one of its entries.
 * Keys match the collection names in the manifest's document schema, the same
 * way `norvenComponents` keys match section `type` literals.
 */
export const norvenEntryComponents: EntryComponentMap = {
  projects: ProjectDetail,
};
