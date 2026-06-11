/**
 * ADR-0009 module-per-domain layering, enforced by lint.
 *
 * Consumed by `apps/api/eslint.config.js` (Branch 9). Within a module, files
 * import each other by relative path (`./adapter`, `./db`, `./service`), so we
 * match the import *string* with the built-in `no-restricted-imports` — no import
 * resolver needed.
 *
 * The three rules:
 *   1. routes → services only (never adapters or db directly)
 *   2. adapters → SDKs only (never services or db)
 *   3. services → plain functions (never framework/Hono types)
 */
export const apiBoundaries = [
  {
    files: ["src/modules/**/routes.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./adapter", "./adapter.*", "*/adapter", "*/adapter.*"],
              message: "Routes call services, not adapters directly (ADR-0009).",
            },
            {
              group: ["./db", "./db.*", "*/db", "*/db.*"],
              message: "Routes call services, not db helpers directly (ADR-0009).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/adapter.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./service", "./service.*", "*/service", "*/service.*"],
              message: "Adapters wrap external SDKs and never import services (ADR-0009).",
            },
            {
              group: ["./db", "./db.*", "*/db", "*/db.*"],
              message: "Adapters never touch the database layer (ADR-0009).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/service.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "hono",
              message:
                "Services are framework-agnostic plain functions; keep Hono in routes (ADR-0009).",
            },
          ],
        },
      ],
    },
  },
];
