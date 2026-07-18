import type { SectionComponentProps } from "@plinth/renderer";
import { statsSection } from "../manifest";

/** Studio numbers. Numeric values get data-count (the runtime animates them
 * from zero); non-numeric values render as typed — and everything shows its
 * final value without JavaScript or with reduced motion. */
export function Stats({ section }: SectionComponentProps) {
  const { fields } = statsSection.parse(section);
  return (
    <section id="stats" className="bg-bone py-32 lg:py-44" data-section="stats">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid grid-cols-2 gap-12 lg:grid-cols-4 lg:gap-8">
          {fields.items.map((stat, index) => {
            const numeric = Number(stat.value.replaceAll(",", ""));
            const countable = stat.value.trim() !== "" && Number.isFinite(numeric);
            return (
              <div key={index} className="border-line-2 border-t pt-8" data-reveal>
                <p
                  className="font-display text-ink leading-none"
                  style={{ fontSize: "clamp(3rem, 6vw, 5.5rem)" }}
                >
                  <span data-count={countable ? numeric : undefined}>
                    {countable ? numeric.toLocaleString() : stat.value}
                  </span>
                </p>
                <p className="text-ink-3 mt-6 font-mono text-xs tracking-[0.18em] uppercase">
                  {stat.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
