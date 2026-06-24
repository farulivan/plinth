"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. baseURL defaults to the current origin (the
 * dashboard is the auth origin), so no public env var is needed. The
 * magic-link client plugin mirrors the server plugin, enabling
 * `authClient.signIn.magicLink(...)`.
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
