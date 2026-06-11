import { z } from "zod";

/** Normalized email — the only credential in the system (ADR-0005). */
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Magic-link request — the login form's entire surface. */
export const loginRequest = z.object({ email });
export type LoginRequest = z.infer<typeof loginRequest>;

/** Per-user magic-link send limits (ADR-0005), enforced by the api's rate
 * limiter against Upstash. Constants live beside the schema so the limiter
 * and the ADR can't drift apart silently. */
export const MAGIC_LINK_RATE_LIMIT = {
  perWindow: 5,
  windowMinutes: 15,
  perDay: 20,
} as const;
