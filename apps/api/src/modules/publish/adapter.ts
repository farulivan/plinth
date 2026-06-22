/**
 * External-SDK boundary for the publish domain — enqueues Astro builds via
 * Inngest and writes rendered output to R2 (ADR-0003). Pure vendor calls; never
 * imports service or db (ADR-0009). Impl lands with the publish pipeline.
 */
export {};
