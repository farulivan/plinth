import type { SectionComponentProps } from "@plinth/renderer";
import { featuredProjectsSection } from "../manifest";
import { Frame } from "../media/Frame";

/**
 * Selected work, ported from FeaturedProjects.astro: alternating photo/text
 * rows with sticky captions. Project detail links are gone on purpose —
 * tenant sites are single-page in v1, so cards are non-navigating articles.
 */
export function FeaturedProjects({ section }: SectionComponentProps) {
  const { fields } = featuredProjectsSection.parse(section);
  return (
    <section className="bg-bone py-24 lg:py-32" data-section="featuredProjects">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2 className="eyebrow mb-16" data-reveal-lift>
          {fields.heading}
        </h2>
        <div className="flex flex-col gap-24 lg:gap-40">
          {fields.items.map((item, index) => {
            const flip = index % 2 === 1;
            return (
              <article
                key={index}
                className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <div className={flip ? "block lg:order-2" : "block"} data-reveal>
                  <Frame
                    media={item.image}
                    ratio="4/3"
                    seed={index}
                    parallax
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                </div>
                <div
                  className={
                    flip
                      ? "lg:order-1 lg:sticky lg:top-32 lg:self-start"
                      : "lg:sticky lg:top-32 lg:self-start"
                  }
                  data-reveal
                >
                  <p className="eyebrow text-brass-2 mb-5">{item.meta}</p>
                  <h3
                    className="font-display text-ink leading-[0.98]"
                    style={{ fontSize: "var(--text-display-3)" }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-ink-3 mt-4 font-mono text-xs tracking-[0.14em] uppercase">
                    {item.location}
                  </p>
                  <p className="text-ink-3 mt-8 max-w-md text-base leading-relaxed">{item.brief}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
