import "server-only";
import { createAuth } from "@plinth/auth";
import { env } from "@/lib/env";
import { db } from "@/server/db";

/**
 * The dashboard's Better Auth runtime. It is the auth origin (BETTER_AUTH_URL
 * points here), so it hosts the handler routes; the api validates the same
 * sessions through the shared db + secret. Shares the app-wide pool from
 * server/db.ts; nothing touches the network at import, so `next build` loads
 * this module without a reachable database.
 */
export const auth = createAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  resendApiKey: env.RESEND_API_KEY,
  emailFrom: env.EMAIL_FROM,
});
