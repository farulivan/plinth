import type { SectionComponentProps } from "@plinth/renderer";
import { pageHeroSection } from "../manifest";
import { lines } from "./lines";

/** An interior page's masthead, ported from PageHero.astro. Type alone — no
 * photograph, so a page can open before anyone has found an image for it. */
export function PageHero({ section }: SectionComponentProps) {
  const { fields } = pageHeroSection.parse(section);
  return (
    <section className="bg-bone relative pt-32 pb-20 lg:pt-44 lg:pb-28" data-section="pageHero">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <p className="eyebrow text-brass-2 mb-10" data-reveal-lift>
          {fields.eyebrow}
        </p>
        <h1
          className="font-display text-ink leading-[0.92]"
          style={{ fontSize: "var(--text-display-1)" }}
          data-reveal-lift
        >
          {lines(fields.title)}
        </h1>
        {fields.subtitle ? (
          <p
            className="text-ink-3 mt-12 max-w-2xl text-lg leading-relaxed lg:text-xl"
            data-reveal-lift
          >
            {fields.subtitle}
          </p>
        ) : null}
      </div>
    </section>
  );
}
