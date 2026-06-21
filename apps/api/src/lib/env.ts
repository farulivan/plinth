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
  // Vars are added as the modules that need them land — DB/auth +
  // --env-file wiring in 9.3, Sentry DSN in 9.2.
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
