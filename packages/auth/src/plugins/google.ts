import type { BetterAuthOptions } from "better-auth";

export interface GoogleOptions {
  clientId?: string;
  clientSecret?: string;
}

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

/**
 * Google OAuth, off until configured (ADR-0005: magic-link is primary, Google
 * a later convenience). Returns an empty object when either credential is
 * missing — spread into `socialProviders` so an unconfigured deploy simply has
 * no Google button, never a half-wired provider that 500s on callback.
 */
export function googleProvider({ clientId, clientSecret }: GoogleOptions): SocialProviders {
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret } };
}
