import { createDb } from "@plinth/db";
import { env } from "./env";

/**
 * The api's one pg pool. createDb is lazy (no connection until the first
 * query), so importing this at boot is free. Shared by the HTTP app
 * (app.ts) and the Inngest functions, which run in the same process but
 * outside the request middleware chain.
 */
export const { db } = createDb({ connectionString: env.DATABASE_URL });
