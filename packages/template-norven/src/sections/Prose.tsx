import type { SectionComponentProps } from "@plinth/renderer";
import { proseSection } from "../manifest";
import { lines } from "./lines";

/**
 * Headed blocks of paragraphs — the plainest thing a page can be made of, and
 * what the colophon is mostly made of.
 *
 * Several blocks in one section rather than one section each, because section
 * types are unique per page (ADR-0015). Each block still renders as its own
 * `<section>`, so the tinting and the document outline are unaffected.
 */
export function Prose({ section }: SectionComponentProps) {
  const { fields } = proseSection.parse(section);
  return (
    <>
      {fields.blocks.map((block) => (
        <section
          key={block.heading}
          className={block.tone === "bone2" ? "bg-bone-2 py-24 lg:py-32" : "bg-bone py-24 lg:py-32"}
          data-section="prose"
        >
          <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
            <p className="eyebrow mb-8" data-reveal>
              {block.eyebrow}
            </p>
            <h2
              className="font-display text-ink mb-10 leading-[1.05]"
              style={{ fontSize: "var(--text-display-3)" }}
              data-reveal
            >
              {lines(block.heading)}
            </h2>
            <div className="text-ink-3 space-y-6 text-base leading-relaxed lg:text-lg" data-reveal>
              {block.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
