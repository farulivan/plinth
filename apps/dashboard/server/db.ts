import "server-only";
import { createDb } from "@plinth/db";
import { env } from "@/lib/env";

/**
 * The dashboard's single pg pool. Everything server-side (Better Auth, layout
 * membership reads, Server Actions) shares it — one pool per app instance per
 * ADR-0008/0011 (Neon pooler budget). createDb is lazy: no connection until
 * the first query, so `next build` loads this module without a database.
 */
export const { db } = createDb({ connectionString: env.DATABASE_URL });
