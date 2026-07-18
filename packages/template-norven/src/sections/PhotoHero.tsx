import type { SectionComponentProps } from "@plinth/renderer";
import { photoHeroSection } from "../manifest";
import { Frame } from "../media/Frame";
import { lines } from "./lines";

/** The landing hero, ported from norven's PhotoHero.astro (overlay variant —
 * the one the landing page uses): full-bleed photo, ink gradient, title block
 * pinned to the bottom edge. data-hero-scale drives the slow zoom. */
export function PhotoHero({ section }: SectionComponentProps) {
  const { fields } = photoHeroSection.parse(section);
  return (
    <section className="bg-bone" data-section="photoHero">
      <div className="relative min-h-[88vh]" data-hero-scale>
        <Frame media={fields.photo} ratio="16/10" fill sizes="100vw" priority />
        <div className="from-ink/70 via-ink/10 absolute inset-0 bg-linear-to-t to-transparent" />
        <div className="absolute inset-0 mx-auto flex max-w-[1400px] flex-col justify-end px-6 pb-16 lg:px-10 lg:pb-24">
          {fields.eyebrow ? (
            <p
              className="text-bone/80 mb-6 font-mono text-[11px] tracking-[0.18em] uppercase"
              data-reveal-lift
            >
              {fields.eyebrow}
            </p>
          ) : null}
          <h1
            className="font-display text-bone leading-[0.92]"
            style={{ fontSize: "var(--text-display-1)" }}
            data-reveal-lift
          >
            {lines(fields.title)}
          </h1>
          {fields.subtitle ? (
            <p
              className="text-bone/85 mt-8 max-w-xl text-base leading-relaxed lg:text-lg"
              data-reveal-lift
            >
              {fields.subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
