import type { EntryComponentProps } from "@plinth/renderer";
import { projectEntryFields } from "../manifest";
import { Frame } from "../media/Frame";

/**
 * One project's detail page, ported from norven's projects/[slug].astro: a
 * full-bleed cover, the title and its specification table, the body as
 * paragraphs, the gallery, the client quote, and prev/next.
 *
 * A collection is rendered by one component rather than dispatched through a
 * map the way sections are (ADR-0015): an entry is one shape repeated, so
 * there is nothing to dispatch on. `fields` is parsed here for the same reason
 * every section parses its own — the renderer hands them over unvalidated
 * because it has no idea what template this is.
 */
export function ProjectDetail({ entry, prev, next }: EntryComponentProps) {
  const project = projectEntryFields.parse(entry.fields);

  return (
    <article data-collection="projects">
      <Frame
        media={project.cover}
        ratio="16/9"
        seed={0}
        parallax
        sizes="100vw"
        priority
        className="w-full"
      />

      <section className="bg-bone py-16 lg:py-24">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <p className="eyebrow text-brass-2 mb-6" data-reveal>
            {project.kind} · {project.year} · {project.status}
          </p>
          <h1
            className="font-display text-ink leading-[0.92]"
            style={{ fontSize: "var(--text-display-1)" }}
            data-reveal
          >
            {project.title}
          </h1>

          <dl
            className="border-line-2 mt-12 grid grid-cols-2 gap-y-6 border-t pt-8 lg:grid-cols-3"
            data-reveal
          >
            <div>
              <dt className="eyebrow mb-1">Location</dt>
              <dd className="text-ink font-mono text-sm">{project.location}</dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">Area</dt>
              <dd className="text-ink font-mono text-sm">{project.area}</dd>
            </div>
            <div>
              <dt className="eyebrow mb-1">Status</dt>
              <dd className="text-ink font-mono text-sm">{project.status}</dd>
            </div>
          </dl>

          <div className="mt-16 max-w-[68ch]">
            {project.body.map((paragraph, index) => (
              <p key={index} className="text-ink-2 mb-6 text-lg leading-relaxed" data-reveal>
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      {project.gallery.length > 0 ? (
        <section className="bg-bone-2 py-20 lg:py-28" data-section="projectGallery">
          <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {project.gallery.map((slide, index) => (
                <figure key={index} className="m-0" data-reveal>
                  <Frame
                    media={slide.image}
                    ratio="4/3"
                    seed={index + 1}
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                  {slide.caption ? (
                    <figcaption className="text-ink-3 mt-4 font-mono text-xs tracking-[0.14em] uppercase">
                      {slide.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {project.testimonial ? (
        <section className="bg-ink text-bone py-28 lg:py-36" data-section="projectTestimonial">
          <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
            <blockquote
              className="font-display text-bone max-w-[24ch] leading-[1.15] italic"
              style={{ fontSize: "var(--text-display-3)" }}
              data-reveal-lift
            >
              &ldquo;{project.testimonial.quote}&rdquo;
              <footer className="text-bone/70 mt-10 font-sans text-sm not-italic">
                — {project.testimonial.author}, {project.testimonial.role}
              </footer>
            </blockquote>
          </div>
        </section>
      ) : null}

      {/* Omitted entirely for a collection of one, where both links would point
          at the page they are on (ADR-0015). */}
      {prev && next ? (
        <nav className="bg-bone border-line-2 border-t py-12" aria-label="Projects">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 lg:px-10">
            <a href={prev.path} className="group block max-w-[45%]" rel="prev">
              <span className="eyebrow text-ink-3 mb-2 block">Previous</span>
              <span className="font-display text-ink group-hover:text-brass-2 text-xl transition-colors">
                {titleOf(prev.entry.fields)}
              </span>
            </a>
            <a href={next.path} className="group block max-w-[45%] text-right" rel="next">
              <span className="eyebrow text-ink-3 mb-2 block">Next</span>
              <span className="font-display text-ink group-hover:text-brass-2 text-xl transition-colors">
                {titleOf(next.entry.fields)}
              </span>
            </a>
          </div>
        </nav>
      ) : null}
    </article>
  );
}

/**
 * A neighbour's label. Read leniently rather than parsed: a neighbour is
 * someone else's entry and may still be half-written, and throwing here would
 * take down a project that is itself complete because the one after it is not.
 */
function titleOf(fields: unknown): string {
  const title = (fields as { title?: unknown }).title;
  return typeof title === "string" && title.length > 0 ? title : "Untitled project";
}
