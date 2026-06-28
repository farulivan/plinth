import { nextJsConfig } from "@plinth/eslint-config/next";

/** @type {import("eslint").Linter.Config[]} */
export default [...nextJsConfig, { ignores: ["next-env.d.ts"] }];
