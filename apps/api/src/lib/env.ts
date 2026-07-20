import { z } from "zod";

/**
 * The api's environment contract. Apps own env parsing — shared packages take
 * config values and never read process.env (see createDb/createAuth). Parsed
 * once at boot; a missing or malformed var fails fast here. Import { env }
 * downstream instead of touching process.env.
 */
/** dotenv turns `KEY=` into an empty string; treat that as unset so optional
 * vars don't fail their shape check. */
const optionalEnv = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  // Shared secret for the dashboard→api HMAC envelope (ADR-0008). The dashboard
  // signs with the same value. ≥32 chars enforced — dev-setup.sh generates one
  // via `openssl rand -base64 32`.
  INTERNAL_API_HMAC_SECRET: z.string().min(32),
  // Inngest (ADR-0003). Local: INNGEST_DEV=1 targets the compose dev server and
  // needs no keys. Production: unset INNGEST_DEV, set both keys via Fly secrets
  // (the SDK reads INNGEST_SIGNING_KEY from process.env for endpoint auth).
  INNGEST_DEV: optionalEnv,
  INNGEST_EVENT_KEY: optionalEnv,
  INNGEST_SIGNING_KEY: optionalEnv,
  // R2 / S3-compatible storage for published sites (ADR-0003). Local: the
  // compose MinIO. Production: the R2 account endpoint + scoped API tokens.
  R2_ENDPOINT_URL: z.url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_SITES: z.string().min(1),
  R2_BUCKET_MEDIA: z.string().min(1),
  // Tenant hostname suffix appended to the workspace slug (ADR-0004):
  // ".farulivan.com" in production, ".localhost" against wrangler dev.
  TENANT_HOST_SUFFIX: z.string().min(1).default(".localhost"),
  // Cloudflare KV sync credentials — production only; absent locally, where
  // `pnpm worker:sync` seeds the simulated KV instead.
  CLOUDFLARE_API_TOKEN: optionalEnv,
  CLOUDFLARE_ACCOUNT_ID: optionalEnv,
  CLOUDFLARE_KV_NAMESPACE_ID: optionalEnv,
  // Upstash Redis REST (rate limiting, ADR-0003/0006). Local: the SRH proxy in
  // docker-compose.dev.yml. Production: the real Upstash REST endpoint.
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  // SENTRY_DSN_API is read raw in instrument.ts (preloads before this contract).
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
