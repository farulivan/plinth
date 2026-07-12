// Server-only boundary. ADR-0008 calls for an `import "server-only"` marker,
// but that package throws in any non-React-server runtime (it would crash the
// Hono api at boot) — so the guard is a plain browser check, and the dashboard
// additionally enforces the boundary with an ESLint restriction.
if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
  throw new Error("@plinth/db is server-only and must never reach a client bundle.");
}

export * from "./client";
export * from "./contentHash";
export * from "./rls";
