import type { SectionComponentProps } from "@plinth/renderer";
import { recognitionSection } from "../manifest";

/** Awards and citations, ported from studio.astro. A list rather than a
 * table: three cells with no header row is a list wearing a grid. */
export function Recognition({ section }: SectionComponentProps) {
  const { fields } = recognitionSection.parse(section);
  return (
    <section className="bg-bone py-24 lg:py-32" data-section="recognition">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2 className="eyebrow mb-12" data-reveal>
          {fields.eyebrow}
        </h2>
        <ul className="divide-line-2 divide-y">
          {fields.items.map((item) => (
            <li
              key={`${item.year}-${item.title}`}
              className="grid grid-cols-[80px_1fr_auto] items-baseline gap-6 py-6"
              data-reveal
            >
              <span className="text-ink-3 font-mono text-sm">{item.year}</span>
              <span className="font-display text-ink text-xl">{item.title}</span>
              <span className="text-ink-3 text-right font-mono text-xs lg:text-sm">
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
