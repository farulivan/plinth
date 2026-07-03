import "server-only";
import { z } from "zod";

/** Optional env var where `KEY=` (what dotenv yields for a blank line in .env)
 * means "unset" — empty coerces to undefined before the min(1) check, honoring
 * .env.example's "leave empty for the dev fallback" contract. */
const optionalEnv = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * The dashboard's server-side environment contract. Apps own env parsing (the
 * api does the same); shared packages take config values and never read
 * process.env. The `server-only` import makes an accidental client import a
 * build error, so BETTER_AUTH_SECRET can never leak into a client bundle.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  // Internal RPC to the api (ADR-0008): base URL + the shared HMAC secret the
  // api's internalHmac verifies. Must match the api's value; ≥32 chars enforced
  // (dev-setup.sh generates one via `openssl rand -base64 32`).
  INTERNAL_API_URL: z.url(),
  INTERNAL_API_HMAC_SECRET: z.string().min(32),
  // Magic-link delivery: leave both empty/unset for the stdout dev fallback
  // (ADR-0005).
  RESEND_API_KEY: optionalEnv,
  EMAIL_FROM: optionalEnv,
});

export type Env = z.infer<typeof envSchema>;

// `next build` evaluates route modules, which would trip this parse before real
// values exist. Docker/CI set SKIP_ENV_VALIDATION=1 to defer validation to
// runtime (where Fly secrets are present); production always parses for real.
export const env: Env = process.env.SKIP_ENV_VALIDATION
  ? (process.env as unknown as Env)
  : envSchema.parse(process.env);
