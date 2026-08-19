import { fileURLToPath } from "node:url";

/**
 * Absolute path to the static files this template ships, for the builder's
 * `publicDir`.
 *
 * Its own module, and deliberately NOT re-exported from the package barrel.
 * The barrel is imported by the dashboard's editor, which is a client
 * component; `node:url` cannot be bundled for the browser, so re-exporting
 * this alongside the brand tokens took the whole dashboard build down with a
 * module-not-found on a path nothing in the editor even reads. Brand data is
 * safe everywhere, a filesystem path is not, and the split is what keeps that
 * distinction from being re-discovered.
 *
 * Derived from `import.meta.url` rather than written relative to the consumer,
 * because that consumer is `astro.config.mjs` in another package and the two
 * sit at different depths in the pruned Docker tree than in the workspace.
 */
export const norvenPublicDir = fileURLToPath(new URL("../public/", import.meta.url));
