/**
 * Business logic for the media domain — composes db (Postgres rows) with adapter
 * (Cloudflare R2 + Sharp). Framework-agnostic: no Hono import, so the same
 * functions can run from a route or an Inngest job (ADR-0009). Impl lands with
 * the media pipeline.
 */
export {};
