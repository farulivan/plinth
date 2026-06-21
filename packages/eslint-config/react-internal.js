import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/** Flat config for internal React component libraries (packages/ui, packages/renderer). */
export const reactInternalConfig = [
  ...baseConfig,
  {
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: { ...globals.browser },
    },
  },
  // New JSX transform (tsconfig `jsx: react-jsx`): React need not be in scope,
  // so disable react-in-jsx-scope / jsx-uses-react.
  pluginReact.configs.flat["jsx-runtime"],
  {
    plugins: { "react-hooks": pluginReactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
];
