import type { SectionComponentProps } from "@plinth/renderer";
import { locationsSection } from "../manifest";

/** The studios, on ink — ported from studio.astro's locations block. */
export function Locations({ section }: SectionComponentProps) {
  const { fields } = locationsSection.parse(section);
  return (
    <section className="bg-ink text-bone py-24 lg:py-32" data-section="locations">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2
          className="text-bone/60 mb-12 font-mono text-[11px] tracking-[0.18em] uppercase"
          data-reveal
        >
          {fields.eyebrow}
        </h2>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 lg:gap-16">
          {fields.items.map((studio) => (
            <article key={studio.city} data-reveal>
              <h3 className="font-display text-bone mb-6 text-3xl lg:text-4xl">{studio.city}</h3>
              <p className="text-bone/70 text-sm leading-relaxed">
                {studio.address}
                <br />
                {studio.country}
              </p>
              {studio.hours ? (
                <p className="text-bone/50 mt-6 font-mono text-xs tracking-[0.14em] uppercase">
                  {studio.hours}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
