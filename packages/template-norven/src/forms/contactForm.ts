/**
 * Progressive enhancement for the contact form, ported from norven's
 * contact.astro.
 *
 * Without this the form posts natively and the visitor lands on Web3Forms'
 * confirmation page — which works, and is the reason the markup is a real
 * `<form>` with a real `action`. This upgrades it in place: intercept, submit
 * with `fetch`, and announce the result inline without a navigation.
 *
 * A module rather than an inline `<script>`, and that is not a style
 * preference. The tenant CSP is `script-src 'self'`; an inline script would
 * need `'unsafe-inline'` widened for every tenant, or a nonce the edge cannot
 * produce for a static object served from R2. Bundled, it is just another
 * file under `/_astro/`.
 *
 * Idempotent, and bound per navigation like the motion runtime: under view
 * transitions a soft navigation swaps in a new form element, and a listener
 * attached to the old one goes with it.
 *
 * It imports nothing. The endpoint comes from the form's own `action`, which
 * makes it impossible for the enhanced path and the no-JavaScript path to post
 * to different places — and importing the constant instead cost 22.5 KB,
 * because the schema barrel that defines it pulls zod into the browser. The
 * bundle budget caught that; nothing else would have.
 */
export function enhanceContactForms(): void {
  const forms = document.querySelectorAll<HTMLFormElement>("form[data-contact-form]");
  for (const form of forms) {
    if (form.dataset["enhanced"] === "true") continue;
    form.dataset["enhanced"] = "true";
    form.addEventListener("submit", (event) => {
      void submit(form, event);
    });
  }
}

async function submit(form: HTMLFormElement, event: SubmitEvent): Promise<void> {
  event.preventDefault();

  // The form's own action — the same URL the native POST would use.
  const endpoint = form.action;
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const button = form.querySelector<HTMLButtonElement>("[data-form-submit]");
  if (!button) return;

  const defaultLabel = button.textContent?.trim() ?? "Send";
  const fallbackEmail = form.dataset["contactEmail"] ?? "the studio";
  const successMessage = form.dataset["successMessage"] ?? "Thank you — your message has arrived.";

  const setStatus = (message: string, state: "success" | "error") => {
    if (!status) return;
    status.textContent = message;
    status.dataset["state"] = state;
  };

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Sending…";
  if (status) {
    delete status.dataset["state"];
    status.textContent = "";
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
    });
    const result = (await response.json()) as { success?: boolean; message?: unknown };

    if (response.ok && result.success) {
      form.reset();
      setStatus(successMessage, "success");
      button.textContent = "Sent ✓";
      // Left disabled on success: the form is empty again, and a second
      // identical submission is the thing an anxious visitor does next.
      button.removeAttribute("aria-busy");
      return;
    }
    throw new Error(typeof result.message === "string" ? result.message : "Submission failed");
  } catch {
    // The service's own message is not surfaced — it is written for a
    // developer and can name the API. An address the visitor can actually
    // write to is more use than a reason they cannot act on.
    setStatus(`Something went wrong. Please email ${fallbackEmail} directly.`, "error");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = defaultLabel;
  }
}
