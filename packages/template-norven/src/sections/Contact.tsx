import type { SectionComponentProps } from "@plinth/renderer";
import { contactSection } from "../manifest";
import { lines } from "./lines";

/** The closing contact spread. The original's "Submit a brief" button linked
 * a /contact subpage — single-page tenant sites drop it; email and phone are
 * the live channels. The heading's last line renders muted, as designed. */
export function Contact({ section }: SectionComponentProps) {
  const { fields } = contactSection.parse(section);
  const headingLines = fields.heading.split("\n");
  const leading = headingLines.slice(0, -1);
  const last = headingLines.at(-1);

  return (
    <section id="contact" className="bg-bone py-32 lg:py-48" data-section="contact">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
          <div>
            <p className="eyebrow text-brass-2 mb-8" data-reveal-lift>
              {fields.eyebrow}
            </p>
            <h2
              className="font-display text-ink pb-4 leading-[0.95]"
              style={{ fontSize: "var(--text-display-2)" }}
              data-reveal-lift
            >
              {leading.length > 0 ? (
                <>
                  {lines(leading.join("\n"))}
                  <br />
                  <span className="text-ink-3">{last}</span>
                </>
              ) : (
                last
              )}
            </h2>
          </div>

          <div className="space-y-10">
            <div data-reveal>
              <p className="eyebrow mb-3">Direct</p>
              <a
                href={`mailto:${fields.email}`}
                className="font-display text-ink hover:text-brass block text-xl transition-colors"
              >
                {fields.email}
              </a>
              {fields.phone ? (
                <a
                  href={`tel:${fields.phone.replaceAll(" ", "")}`}
                  className="text-ink-3 mt-2 block font-mono text-sm"
                >
                  {fields.phone}
                </a>
              ) : null}
            </div>
            {fields.studios && fields.studios.length > 0 ? (
              <div data-reveal>
                <p className="eyebrow mb-3">Studios</p>
                <ul className="space-y-3 font-sans text-sm">
                  {fields.studios.map((studio, index) => (
                    <li key={index} className="text-ink-3">
                      <span className="text-ink">{studio.city}</span> · {studio.address}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
