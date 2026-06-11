import { z } from "zod";

/** Magic-link lifetime (ADR-0005): single-use, short-lived, opaque. The TTL
 * constant feeds the Better Auth plugin config in `packages/auth`. */
export const MAGIC_LINK_TTL_MINUTES = 15;

/** Opaque token as it appears in the callback URL. Length floor only —
 * generation, hashing, and single-use consumption are Better Auth's job. */
export const magicLinkToken = z.string().min(32).max(512);
export type MagicLinkToken = z.infer<typeof magicLinkToken>;
