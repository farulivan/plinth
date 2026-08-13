import type { SectionComponentProps } from "@plinth/renderer";
import { processSection } from "../manifest";
import { lines } from "./lines";

/** The six faces of the slowly-rotating cube, ported from Process.astro. The
 * animation itself lives in styles.css so reduced-motion can stop it. */
const FACES = [
  "translateZ(48px)",
  "rotateY(180deg) translateZ(48px)",
  "rotateY(90deg) translateZ(48px)",
  "rotateY(-90deg) translateZ(48px)",
  "rotateX(90deg) translateZ(48px)",
  "rotateX(-90deg) translateZ(48px)",
];

export function Process({ section }: SectionComponentProps) {
  const { fields } = processSection.parse(section);
  return (
    <section id="process" className="bg-bone-2 py-32 lg:py-44" data-section="process">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="mb-20">
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

        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {fields.items.map((item, index) => (
            <article key={item.code} className="flex flex-col items-start" data-reveal>
              {/* Decorative: announced to nobody, and it carries no information
                  the phase text does not already give. */}
              <div className="mb-10 h-24 w-24" style={{ perspective: "600px" }} aria-hidden="true">
                <div
                  className="process-cube relative h-full w-full"
                  style={{ animationDelay: `-${String(index * 3)}s` }}
                >
                  {FACES.map((transform, face) => (
                    <div
                      key={transform}
                      className={
                        face === 3
                          ? "border-ink bg-bone absolute inset-0 border"
                          : "border-ink absolute inset-0 border"
                      }
                      style={{ transform }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-ink-3 mb-2 font-mono text-xs tracking-[0.18em] uppercase">
                Phase {item.code}
              </p>
              <h3 className="font-display text-ink mb-1 text-3xl">{item.title}</h3>
              <p className="text-brass-3 mb-6 font-mono text-[11px] tracking-[0.14em] uppercase">
                {item.duration}
              </p>
              <p className="text-ink-3 text-sm leading-relaxed">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
