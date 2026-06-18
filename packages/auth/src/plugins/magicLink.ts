import { MAGIC_LINK_TTL_MINUTES } from "@plinth/schema/auth";
import { magicLink } from "better-auth/plugins";
import type { EmailSender } from "../email";

/**
 * Magic-link as the primary (only) credential, per ADR-0005. Single-use and
 * short-lived are Better Auth's job; the TTL comes from @plinth/schema so the
 * ADR, the limiter, and this plugin can't drift. Delivery is injected so the
 * dev stdout fallback and a real Resend send share one code path.
 */
export function magicLinkPlugin(sender: EmailSender) {
  return magicLink({
    expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
    sendMagicLink: async ({ email, url }) => {
      await sender.sendMagicLink({ to: email, url });
    },
  });
}
