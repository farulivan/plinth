import type { SectionComponentProps } from "@plinth/renderer";
import { statementSection } from "../manifest";

/** The practice statement — one display-3 paragraph on bone. */
export function Statement({ section }: SectionComponentProps) {
  const { fields } = statementSection.parse(section);
  return (
    <section className="bg-bone py-28 lg:py-40" data-section="statement">
      <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
        <p className="eyebrow mb-10" data-reveal-lift>
          {fields.eyebrow}
        </p>
        <p
          className="font-display text-ink leading-[1.12]"
          style={{ fontSize: "var(--text-display-3)" }}
          data-reveal-lift
        >
          {fields.body}
        </p>
      </div>
    </section>
  );
}
