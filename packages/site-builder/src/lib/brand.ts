import { norvenBrand, type NorvenBrand } from "@plinth/template-norven/brand";
import { norvenPublicDir } from "@plinth/template-norven/public-dir";

/**
 * Template brand lookup, deliberately separate from `templates.ts`.
 *
 * That registry pulls in every section component, and therefore React. This
 * one is imported by `astro.config.mjs` to resolve `publicDir` before the
 * build starts, where dragging the whole component graph into config
 * evaluation would be both slow and circular. Two small registries beat one
 * that cannot be imported from where it is needed.
 */
export interface TemplateBrand {
  brand: NorvenBrand;
  /** Absolute path to the template's static files, used as Astro's publicDir. */
  publicDir: string;
}

const brands: Record<string, TemplateBrand> = {
  "template-norven": { brand: norvenBrand, publicDir: norvenPublicDir },
};

export function templateBrandFor(templateId: string | undefined): TemplateBrand {
  const id = templateId ?? "template-norven";
  const entry = brands[id];
  if (!entry) throw new Error(`Template "${id}" has no brand registered in site-builder.`);
  return entry;
}
