import type { SectionComponentProps } from "@plinth/renderer";
import { peopleSection } from "../manifest";
import { Frame } from "../media/Frame";

/** The principals, ported from studio.astro's team grid. Portraits are
 * optional, so the section works before anyone has been photographed. */
export function People({ section }: SectionComponentProps) {
  const { fields } = peopleSection.parse(section);
  return (
    <section className="bg-bone-2 py-24 lg:py-32" data-section="people">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2 className="eyebrow mb-12" data-reveal>
          {fields.eyebrow}
        </h2>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 lg:gap-16">
          {fields.items.map((person, index) => (
            <article key={person.name} data-reveal>
              {person.portrait ? (
                <div className="mb-8">
                  <Frame
                    media={person.portrait}
                    ratio="3/4"
                    seed={index}
                    sizes="(min-width: 768px) 30vw, 100vw"
                  />
                </div>
              ) : null}
              <p className="text-ink-3 mb-2 font-mono text-[10px] tracking-[0.18em] uppercase">
                {person.role} · {person.base}
              </p>
              <h3 className="font-display text-ink mb-4 text-2xl">{person.name}</h3>
              <p className="text-ink-3 text-sm leading-relaxed">{person.bio}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
