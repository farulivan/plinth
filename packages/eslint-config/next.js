import pluginNext from "@next/eslint-plugin-next";
import globals from "globals";

import { config as baseConfig } from "./base.js";
import { reactConfig } from "./react.js";

/** Flat config for the Next.js dashboard (apps/dashboard). */
export const nextJsConfig = [
  ...baseConfig,
  ...reactConfig,
  {
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
  {
    plugins: { "@next/next": pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
];
