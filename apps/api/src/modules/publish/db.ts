/**
 * Data access for the publish domain — workspace-scoped Drizzle queries over
 * contentVersions / publish state. The only publish layer that touches Postgres
 * (ADR-0009); callers reach it through service. Impl lands with the publish
 * pipeline.
 */
export {};
