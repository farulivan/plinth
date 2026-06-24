import "server-only";
import { createAuth } from "@plinth/auth";
import { createDb } from "@plinth/db";
import { env } from "@/lib/env";

/**
 * The dashboard's Better Auth runtime. It is the auth origin (BETTER_AUTH_URL
 * points here), so it hosts the handler routes; the api validates the same
 * sessions through the shared db + secret. createDb builds a lazy pg pool and
 * createAuth constructs the instance — neither touches the network at import,
 * so `next build` loads this module without a reachable database.
 */
const { db } = createDb({ connectionString: env.DATABASE_URL });

export const auth = createAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  resendApiKey: env.RESEND_API_KEY,
  emailFrom: env.EMAIL_FROM,
});
