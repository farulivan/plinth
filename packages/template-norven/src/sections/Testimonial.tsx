import type { SectionComponentProps } from "@plinth/renderer";
import { testimonialSection } from "../manifest";

/** The client quote on ink — the landing page's one dark section. */
export function Testimonial({ section }: SectionComponentProps) {
  const { fields } = testimonialSection.parse(section);
  return (
    <section
      id="testimonial"
      className="bg-ink text-bone py-32 lg:py-44"
      data-section="testimonial"
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_3fr] lg:gap-20">
          <div>
            <p
              className="text-bone/60 mb-8 font-mono text-[11px] tracking-[0.2em] uppercase"
              data-reveal-lift
            >
              {fields.attribution}
            </p>
            <p
              className="text-bone/50 font-mono text-[11px] tracking-[0.14em] uppercase"
              data-reveal-lift
            >
              {fields.context}
            </p>
          </div>
          <blockquote
            className="font-display text-bone leading-[1.15] italic"
            style={{ fontSize: "var(--text-display-3)" }}
            data-reveal-lift
          >
            &ldquo;{fields.quote}&rdquo;
            <footer className="text-bone/70 mt-10 font-sans text-sm not-italic">
              — {fields.name}
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
