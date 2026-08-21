import type { SectionComponentProps } from "@plinth/renderer";
import { CONTACT_FORM_ENDPOINT } from "@plinth/schema/content";
import { contactFormSection } from "../manifest";

/**
 * The contact form, ported from norven's contact.astro.
 *
 * It is a real `<form>` with a real `action`, so it works with no JavaScript
 * at all — the visitor lands on Web3Forms' own confirmation page. The
 * enhancement script upgrades it in place to a `fetch` with inline status
 * (see ../forms/contactForm.ts). That ordering is the point: the fallback is
 * the markup, not a second code path that has to be kept working.
 *
 * With no delivery key configured the form is not rendered at all. A form that
 * posts into nowhere looks identical to one that works, right up until a
 * visitor's enquiry is silently lost — a plain mailto is worse-looking and
 * strictly more honest. The publish gate refuses this case, so it can only be
 * seen in a preview, which is exactly where an author should see it.
 */
export function ContactForm({ section, site }: SectionComponentProps) {
  const { fields } = contactFormSection.parse(section);
  const accessKey = site?.contactFormKey;
  const siteName = site?.name ?? "";

  return (
    <section id="contact-form" className="bg-bone py-24 lg:py-32" data-section="contactForm">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2 className="sr-only">{fields.heading}</h2>

        {fields.note ? (
          <p
            className="border-brass-3/60 bg-brass-2/5 text-ink-2 mb-10 max-w-[68ch] border-l-2 px-5 py-4 font-mono text-[11px] leading-relaxed tracking-[0.04em]"
            data-reveal
          >
            {fields.note}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <div>
            {accessKey ? (
              <form
                action={CONTACT_FORM_ENDPOINT}
                method="POST"
                data-contact-form
                data-contact-email={fields.fallbackEmail}
                data-success-message={fields.successMessage}
                className="max-w-[52ch] space-y-8"
              >
                <input type="hidden" name="access_key" value={accessKey} />
                <input type="hidden" name="subject" value={`New enquiry — ${siteName}`} />
                <input type="hidden" name="from_name" value={`${siteName} website`} />
                {/* Honeypot: never shown, never focusable, never announced. A bot
                that fills every field fills this one and is rejected by
                Web3Forms; `aria-hidden` plus tabIndex keeps it away from
                anyone using a keyboard or a screen reader. */}
                <input
                  type="checkbox"
                  name="botcheck"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />

                <div data-reveal>
                  <label htmlFor="contact-name" className="eyebrow mb-3 block">
                    Name
                  </label>
                  <input
                    type="text"
                    id="contact-name"
                    name="Name"
                    required
                    autoComplete="name"
                    className="border-line-2 focus:border-ink bg-bone w-full border-b py-3 font-sans text-base transition-colors outline-none"
                  />
                </div>
                <div data-reveal>
                  <label htmlFor="contact-email" className="eyebrow mb-3 block">
                    Email
                  </label>
                  <input
                    type="email"
                    id="contact-email"
                    name="Email"
                    required
                    autoComplete="email"
                    className="border-line-2 focus:border-ink bg-bone w-full border-b py-3 font-sans text-base transition-colors outline-none"
                  />
                </div>
                <div data-reveal>
                  <label htmlFor="contact-kind" className="eyebrow mb-3 block">
                    Project type
                  </label>
                  <select
                    id="contact-kind"
                    name="Project type"
                    defaultValue={fields.projectTypes[0]!.label}
                    className="border-line-2 focus:border-ink bg-bone w-full border-b py-3 font-sans text-base transition-colors outline-none"
                  >
                    {fields.projectTypes.map((option) => (
                      <option key={option.label}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div data-reveal>
                  <label htmlFor="contact-brief" className="eyebrow mb-3 block">
                    A short brief
                  </label>
                  <textarea
                    id="contact-brief"
                    name="Brief"
                    rows={6}
                    required
                    className="border-line-2 focus:border-ink bg-bone w-full resize-none border-b py-3 font-sans text-base transition-colors outline-none"
                  />
                </div>
                <button
                  type="submit"
                  data-form-submit
                  className="border-ink text-ink hover:bg-ink hover:text-bone border px-8 py-4 font-mono text-xs tracking-[0.18em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {fields.submitLabel}
                </button>
                {/* Empty and announced: `aria-live="polite"` on a node already in
                the document means the result is read out when it arrives.
                Rendering the status node only on success would leave nothing
                for the live region to observe. */}
                <p
                  data-form-status
                  role="status"
                  aria-live="polite"
                  className="font-mono text-sm leading-relaxed tracking-[0.02em]"
                />
              </form>
            ) : (
              <p className="text-ink-2 max-w-[52ch] text-base leading-relaxed">
                Write to{" "}
                <a href={`mailto:${fields.fallbackEmail}`} className="underline underline-offset-4">
                  {fields.fallbackEmail}
                </a>
                .
              </p>
            )}
          </div>

          {/* The same details the closing spread carries elsewhere, read from
            site settings rather than restated here — a studio that moves
            should not have to remember which sections mention its address. */}
          <aside className="space-y-10">
            {site?.contactEmail ? (
              <div data-reveal>
                <p className="eyebrow mb-4">Direct</p>
                <a
                  href={`mailto:${site.contactEmail}`}
                  className="font-display text-ink hover:text-brass block text-2xl transition-colors"
                >
                  {site.contactEmail}
                </a>
                {site.contactPhone ? (
                  <a
                    href={`tel:${site.contactPhone.replaceAll(" ", "")}`}
                    className="text-ink-3 mt-2 block font-mono text-sm"
                  >
                    {site.contactPhone}
                  </a>
                ) : null}
              </div>
            ) : null}

            {site?.locations && site.locations.length > 0 ? (
              <div data-reveal>
                <p className="eyebrow mb-4">Studios</p>
                {/* Fuller than the closing spread's one-line form: this is
                    the page a visitor reaches when they want to find you, so
                    the address is the content rather than a reminder. */}
                <ul className="space-y-6">
                  {site.locations.map((studio) => (
                    <li key={studio.city}>
                      <h3 className="font-display text-ink text-xl">{studio.city}</h3>
                      <p className="text-ink-3 mt-1 text-sm leading-relaxed">
                        {studio.address}
                        <br />
                        {studio.country}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
