import type { APIRoute } from "astro";

import { templateBrandFor } from "../lib/brand";
import { snapshot } from "../lib/snapshot";

/**
 * The web app manifest, generated rather than shipped as a static file.
 *
 * It is the one icon-adjacent file that is not purely a template asset: the
 * colours and the icon set belong to the design, but `name` and `short_name`
 * are the tenant's own site name. A static file in the template's public/
 * would have frozen one studio's name into every site built from it, and
 * renaming a site in the editor would silently not reach the install prompt.
 *
 * Served at `.webmanifest` to match the standalone site's URL, which means the
 * publish upload has to know that extension — see `contentTypeFor`.
 */
export const prerender = true;

export const GET: APIRoute = () => {
  const { site } = snapshot();
  const { manifest } = templateBrandFor(process.env.TEMPLATE_ID).brand;

  const body = {
    name: site.name,
    short_name: site.name,
    ...(site.description ? { description: site.description } : {}),
    icons: manifest.icons,
    theme_color: manifest.themeColor,
    background_color: manifest.backgroundColor,
    display: manifest.display,
    start_url: "/",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
};
