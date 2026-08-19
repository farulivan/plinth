// @ts-check
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import { templateBrandFor } from "./src/lib/brand.js";
import { noindexPaths } from "./src/lib/snapshot.js";

// The publish job invokes `astro build` with SNAPSHOT_PATH/TEMPLATE_ID/OUT_DIR
// in the environment (ADR-0013). OUT_DIR points into a per-version temp
// directory so concurrent builds never share output; the ./dist fallback is
// for building by hand. Tailwind processes the template package's styles.css
// (its @source covers the template sources).
//
// SITE_URL is the tenant's own origin, resolved by the api from the workspace
// hostname. The sitemap needs it because a sitemap carries absolute URLs and
// has no other way to learn the host it is describing; the layout uses it for
// canonical and Open Graph URLs, which have the same problem.
const site = process.env.SITE_URL;

// A page marked noindex is excluded rather than listed: a sitemap is a
// request to index, so listing a page that also carries `noindex` sends a
// crawler two contradictory instructions.
const excluded = new Set(noindexPaths());

// Static files come from the ACTIVE TEMPLATE, not from this package. A
// public/ directory here is shared by every tenant that ever builds, so the
// scaffold favicon it shipped with was served as each of their brand marks;
// icons belong to whoever owns the design. Astro copies publicDir verbatim,
// so this is the whole mechanism.
const { publicDir } = templateBrandFor(process.env.TEMPLATE_ID);

export default defineConfig({
  ...(site ? { site } : {}),
  integrations: [react(), sitemap({ filter: (page) => !excluded.has(new URL(page).pathname) })],
  vite: { plugins: [tailwindcss()] },
  publicDir,
  outDir: process.env.OUT_DIR ?? "./dist",
});
