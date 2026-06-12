import type { Db } from "@plinth/db";
import { accounts, sessions, users, verifications } from "@plinth/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface CreateAuthOptions {
  db: Db;
  /** Public URL Better Auth mounts under, e.g. http://localhost:3000. */
  baseURL: string;
  /** BETTER_AUTH_SECRET — apps read env and pass it in; this package never
   * touches process.env. */
  secret: string;
}

/**
 * Better Auth server instance (ADR-0005). Factory, not singleton: apps own
 * env + lifecycle, tests inject a containerized db. Magic-link (primary) and
 * Google OAuth plugins land in the next commits; email/password stays off.
 */
export function createAuth({ db, baseURL, secret }: CreateAuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      // Model → table mapping; the drizzle tables were generated from this
      // very config's CLI output (see packages/db/src/schema/auth.ts).
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    session: {
      // Sliding expiry per ADR-0005: 30-day sessions, refreshed daily.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        // Which workspace the dashboard is acting on; bridged to the RLS GUC
        // by getSession. Server-managed only (input: false).
        activeWorkspaceId: { type: "string", required: false, input: false },
      },
    },
    advanced: {
      database: {
        // The schema's ids are uuid columns — Better Auth's default nanoid
        // ids would fail them (documented in packages/db/src/schema/auth.ts).
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
