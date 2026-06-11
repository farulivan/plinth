import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import onlyWarn from "eslint-plugin-only-warn";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * Shared flat config for every Plinth workspace.
 *
 * Pinned to ESLint 9 (not 10): `eslint-config-next` transitively requires
 * `eslint-plugin-react`, which peers only to ESLint `^9.7`. ESLint 9 is already
 * flat-config, so nothing is lost. See the version policy in README.md.
 *
 * `import-x` (not the classic `eslint-plugin-import`) is registered here so the
 * ADR-0009 layering rules in `./boundaries.js` resolve when an app spreads both.
 */
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "import-x": importX },
    rules: {
      "import-x/no-duplicates": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    plugins: { turbo: turboPlugin },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  // Downgrade everything to warnings in-editor; CI/`verify` runs `--max-warnings 0`.
  { plugins: { onlyWarn } },
  eslintConfigPrettier,
  { ignores: ["dist/**", ".next/**", ".astro/**", "node_modules/**"] },
];
