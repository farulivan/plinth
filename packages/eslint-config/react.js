import eslintReact from "@eslint-react/eslint-plugin";
import pluginReactHooks from "eslint-plugin-react-hooks";

const recommended = eslintReact.configs["recommended-typescript"];

/**
 * `eslint-plugin-react-hooks` stays the authority on the Rules of Hooks and the
 * React Compiler checks: it is the React team's own. `@eslint-react` ships
 * ports of several of them under the same names, so each port the preset turns
 * on is switched back off, and a finding is reported once, by the official rule.
 */
const portedFromReactHooks = Object.fromEntries(
  Object.keys(pluginReactHooks.rules)
    .map((name) => `@eslint-react/${name}`)
    .filter((rule) => rule in recommended.rules)
    .map((rule) => [rule, "off"]),
);

/**
 * React rules shared by the dashboard (`./next.js`) and the internal React
 * packages (`./react-internal.js`).
 *
 * `@eslint-react` rather than `eslint-plugin-react`: the latter hasn't
 * released since April 2025 and crashes on ESLint 10, which removed the
 * context methods it calls. The TypeScript preset leaves out what the compiler
 * already rejects, such as unknown DOM props, undefined components and
 * duplicate attributes.
 */
export const reactConfig = [
  recommended,
  { rules: portedFromReactHooks },
  {
    plugins: { "react-hooks": pluginReactHooks },
    rules: pluginReactHooks.configs.recommended.rules,
  },
];
