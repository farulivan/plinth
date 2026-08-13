import type { SectionComponentProps } from "@plinth/renderer";
import { practiceSection } from "../manifest";
import { lines } from "./lines";

/**
 * What the practice offers, ported from Practice.astro.
 *
 * The icons are inline SVG paths the template owns, keyed by the manifest's
 * enum — which is why the field is an enum and not a free string: a typo would
 * render an empty box, and an author has no way to discover the valid names.
 */
const ICONS: Record<string, React.ReactNode> = {
  compass: (
    <>
      <circle cx="24" cy="24" r="22" />
      <line x1="24" y1="6" x2="24" y2="14" />
      <line x1="24" y1="34" x2="24" y2="42" />
      <line x1="6" y1="24" x2="14" y2="24" />
      <line x1="34" y1="24" x2="42" y2="24" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </>
  ),
  rule: (
    <>
      <line x1="6" y1="8" x2="42" y2="8" />
      <line x1="6" y1="40" x2="42" y2="40" />
      {[6, 14, 22, 30, 38].map((x, i) => (
        <line key={`t${String(x)}`} x1={x} y1={8} x2={x} y2={i % 2 === 0 ? 14 : 12} />
      ))}
      {[6, 14, 22, 30, 38].map((x, i) => (
        <line key={`b${String(x)}`} x1={x} y1={40} x2={x} y2={i % 2 === 0 ? 34 : 36} />
      ))}
    </>
  ),
  leaf: (
    <>
      <path d="M8 40 C 8 20, 28 8, 40 8 C 40 28, 28 40, 8 40 Z" />
      <line x1="8" y1="40" x2="40" y2="8" />
    </>
  ),
  book: (
    <>
      <rect x="8" y="8" width="32" height="32" />
      <line x1="24" y1="8" x2="24" y2="40" />
      {[16, 22, 28].map((y) => (
        <line key={`l${String(y)}`} x1={14} y1={y} x2={20} y2={y} />
      ))}
      {[16, 22, 28].map((y) => (
        <line key={`r${String(y)}`} x1={28} y1={y} x2={34} y2={y} />
      ))}
    </>
  ),
};

export function Practice({ section }: SectionComponentProps) {
  const { fields } = practiceSection.parse(section);
  return (
    <section id="practice" className="bg-bone py-32 lg:py-44" data-section="practice">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-20 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <p className="eyebrow mb-6" data-reveal>
              {fields.eyebrow}
            </p>
            <h2
              className="font-display text-ink leading-[0.95]"
              style={{ fontSize: "var(--text-display-2)" }}
              data-reveal
            >
              {lines(fields.heading)}
            </h2>
          </div>
          <p className="text-ink-3 self-end text-base leading-relaxed lg:text-lg" data-reveal>
            {fields.intro}
          </p>
        </div>

        <div className="bg-line-2 grid grid-cols-1 gap-px sm:grid-cols-2">
          {fields.items.map((item, index) => (
            <article key={item.title} className="bg-bone group relative p-10 lg:p-12" data-reveal>
              <div className="mb-10 flex items-start justify-between">
                <p className="text-ink-3 font-mono text-xs tracking-[0.18em] uppercase">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div className="text-ink h-12 w-12 transition-transform duration-500 group-hover:rotate-180">
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1">
                    {ICONS[item.icon]}
                  </svg>
                </div>
              </div>
              <h3 className="font-display text-ink mb-4 text-2xl lg:text-3xl">{item.title}</h3>
              <p className="text-ink-3 text-sm leading-relaxed">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
