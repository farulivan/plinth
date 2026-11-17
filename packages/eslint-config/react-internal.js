import globals from "globals";

import { config as baseConfig } from "./base.js";
import { reactConfig } from "./react.js";

/** Flat config for internal React component libraries (packages/ui, packages/renderer). */
export const reactInternalConfig = [
  ...baseConfig,
  ...reactConfig,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
