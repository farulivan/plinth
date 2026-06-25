import "server-only";
import { z } from "zod";

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
  // api's internalHmac verifies. The secret must match the api's value.
  INTERNAL_API_URL: z.url(),
  INTERNAL_API_HMAC_SECRET: z.string().min(1),
  // Magic-link delivery: omit both for the stdout dev fallback (ADR-0005).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

// `next build` evaluates route modules, which would trip this parse before real
// values exist. Docker/CI set SKIP_ENV_VALIDATION=1 to defer validation to
// runtime (where Fly secrets are present); production always parses for real.
export const env: Env = process.env.SKIP_ENV_VALIDATION
  ? (process.env as unknown as Env)
  : envSchema.parse(process.env);
