import type { SectionComponentProps } from "@plinth/renderer";
import { proseSection } from "../manifest";
import { lines } from "./lines";

/** A heading and its paragraphs. The plainest section there is, and what the
 * colophon is mostly made of. */
export function Prose({ section }: SectionComponentProps) {
  const { fields } = proseSection.parse(section);
  return (
    <section
      className={fields.tone === "bone2" ? "bg-bone-2 py-24 lg:py-32" : "bg-bone py-24 lg:py-32"}
      data-section="prose"
    >
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
        <p className="eyebrow mb-8" data-reveal>
          {fields.eyebrow}
        </p>
        <h2
          className="font-display text-ink mb-10 leading-[1.05]"
          style={{ fontSize: "var(--text-display-3)" }}
          data-reveal
        >
          {lines(fields.heading)}
        </h2>
        <div className="text-ink-3 space-y-6 text-base leading-relaxed lg:text-lg" data-reveal>
          {fields.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
