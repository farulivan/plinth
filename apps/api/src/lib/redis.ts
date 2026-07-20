import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * Upstash REST client, shared across rate-limit checks (ADR-0003/0006).
 * Points at SRH locally (docker-compose.dev.yml), the real Upstash endpoint
 * in production — same REST surface either way, per @upstash/redis's design.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});
