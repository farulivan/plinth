// @ts-check
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// The publish job invokes `astro build` with SNAPSHOT_PATH/TEMPLATE_ID/OUT_DIR
// in the environment (ADR-0013). OUT_DIR points into a per-version temp
// directory so concurrent builds never share output; the ./dist fallback is
// for building by hand. Tailwind processes the template package's styles.css
// (its @source covers the template sources).
export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  outDir: process.env.OUT_DIR ?? "./dist",
});
