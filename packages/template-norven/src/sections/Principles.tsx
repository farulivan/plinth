import type { SectionComponentProps } from "@plinth/renderer";
import { principlesSection } from "../manifest";

/** Short essays under one label — the studio's philosophy, ported from the
 * three blocks that were hardcoded in studio.astro. */
export function Principles({ section }: SectionComponentProps) {
  const { fields } = principlesSection.parse(section);
  return (
    <section className="bg-bone py-24 lg:py-32" data-section="principles">
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
        <p className="eyebrow mb-12" data-reveal>
          {fields.eyebrow}
        </p>
        <div className="space-y-12">
          {fields.items.map((item) => (
            <div key={item.heading} data-reveal>
              <h2 className="font-display text-ink mb-6 text-2xl">{item.heading}</h2>
              <p className="text-ink-3 text-base leading-relaxed lg:text-lg">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
