import astro from "eslint-plugin-astro";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * Flat config for Astro workspaces (`packages/site-builder`).
 *
 * `.astro` files need their own parser, so the plugin's recommended set is
 * spread after the base config rather than merged into it — `astro/recommended`
 * registers `astro-eslint-parser` for `**\/*.astro` and leaves every other
 * extension on the base TypeScript parser.
 *
 * `jsx-a11y-recommended` is included because the templates this package renders
 * are held to the same axe budget as the dashboard: a11y regressions should
 * fail at lint time, not at the Lighthouse gate.
 */
export const astroConfig = [
  ...baseConfig,
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-recommended"],
  // Both halves of an Astro file are real: frontmatter and the config run in
  // node at build time, `<script>` blocks run in the browser. Declaring both
  // is what the file actually is, rather than picking one and suppressing the
  // other's `no-undef`.
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
