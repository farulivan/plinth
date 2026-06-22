import { z } from "zod";

/**
 * The api's environment contract. Apps own env parsing — shared packages take
 * config values and never read process.env (see createDb/createAuth). Parsed
 * once at boot; a missing or malformed var fails fast here. Import { env }
 * downstream instead of touching process.env.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  // SENTRY_DSN_API is read raw in instrument.ts (preloads before this contract).
  // INTERNAL_API_HMAC_SECRET lands in 9.5 with the internal-HMAC middleware.
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
