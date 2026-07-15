/**
 * Conventional Commits, enforced at commit-msg by lefthook.
 *
 * Scopes (ADR-0008): an app name, a package name, or a cross-cutting area.
 * A scopeless commit (e.g. `docs: …`) is allowed; a scoped commit must use one
 * of the names below. Add a new package's scope here when it lands.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        // apps
        "dashboard",
        "api",
        // packages
        "schema",
        "db",
        "auth",
        "internal-rpc",
        "renderer",
        "site-builder",
        "ui",
        "template-norven",
        "typescript-config",
        "eslint-config",
        // cross-cutting
        "config",
        "infra",
        "ci",
        "docs",
        "adr",
        "deps",
        "release",
      ],
    ],
  },
};
