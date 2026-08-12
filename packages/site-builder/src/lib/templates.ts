import type { ComponentMap, CollectionRendererMap } from "@plinth/renderer";
import { norvenChrome, norvenCollections, norvenComponents } from "@plinth/template-norven";

/**
 * The builder's template registry: components and chrome per template id.
 *
 * Separate from the dashboard's registry on purpose — that one also carries
 * form descriptors and strict schemas the builder has no use for, and this one
 * runs inside the api's runtime image where the editor's dependencies are not
 * wanted. Adding a template is one entry in each.
 */

export interface BuilderTemplate {
  components: ComponentMap;
  /** Per collection name: the detail body, and how to describe an entry in the
   * page head. */
  collections: CollectionRendererMap;
  chrome: typeof norvenChrome;
}

const templates: Record<string, BuilderTemplate> = {
  "template-norven": {
    components: norvenComponents,
    collections: norvenCollections,
    chrome: norvenChrome,
  },
};

export function templateFor(templateId: string | undefined): BuilderTemplate {
  const id = templateId ?? "template-norven";
  const template = templates[id];
  if (!template) throw new Error(`Template "${id}" is not registered in site-builder.`);
  return template;
}
