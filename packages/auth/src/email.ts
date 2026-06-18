import { Resend } from "resend";

/** What the magic-link plugin needs from the outside world: a way to deliver
 * a sign-in URL. Injectable so tests can capture instead of send. */
export interface EmailSender {
  sendMagicLink(input: { to: string; url: string }): Promise<void>;
}

export interface EmailSenderOptions {
  /** RESEND_API_KEY. Absent ⇒ the stdout dev sender (ADR-0005 dev fallback). */
  resendApiKey?: string;
  /** From address for real sends, e.g. "Plinth <login@plinth.dev>". */
  from?: string;
}

/**
 * Resend-backed sender when a key is present, stdout sender otherwise. The
 * fallback is deliberate, not a degraded mode: local dev has no Resend key,
 * so the magic-link URL prints to the terminal and you click it from there
 * (ADR-0005). The package never reads process.env — the app passes the key.
 */
export function createEmailSender(options: EmailSenderOptions = {}): EmailSender {
  const { resendApiKey, from } = options;

  if (!resendApiKey || !from) {
    return {
      async sendMagicLink({ to, url }) {
        // Intentional dev-mode delivery channel: no Resend key, so the link
        // prints to the terminal you click it from (ADR-0005).
        console.log(`\n[auth] magic-link for ${to}:\n  ${url}\n`);
      },
    };
  }

  const resend = new Resend(resendApiKey);
  return {
    async sendMagicLink({ to, url }) {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: "Your Plinth sign-in link",
        text: `Sign in to Plinth:\n\n${url}\n\nThis link expires shortly and can be used once.`,
      });
      if (error) throw new Error(`Resend send failed: ${error.message}`);
    },
  };
}
