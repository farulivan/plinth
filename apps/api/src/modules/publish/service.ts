/**
 * Business logic for the publish domain — snapshots a content version and hands
 * the Astro build to the queue. Framework-agnostic (no Hono), so an Inngest job
 * can call it directly (ADR-0003/0009). Impl lands with the publish pipeline.
 */
export {};
