import type { EntryComponentProps } from "@plinth/renderer";
import { projectEntryFields } from "../manifest";
import { Frame } from "../media/Frame";
import { mediaRef } from "@plinth/schema/content";
import { summarizeProject } from "./summarize";

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

  // In the body rather than the head: the shape is CreativeWork, which only
  // this template knows, and the builder's layout has no way to read a
  // project's fields. JSON-LD is valid anywhere in the document.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    dateCreated: String(project.year),
    genre: project.kind,
    locationCreated: { "@type": "Place", name: project.location },
    description: project.brief,
  };

  return (
    <article data-collection="projects">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

          {/* The brief, at display size, before the specification table.
              It is the one sentence that says what the project is, and a
              reader who stops after it should still have been told. */}
          <p
            className="font-display text-ink mt-10 leading-[1.18]"
            style={{ fontSize: "var(--text-display-3)" }}
            data-reveal
          >
            {project.brief}
          </p>

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
            {/* A heading, so the photographs are a named region rather than a
                run of unlabelled figures between two blocks of prose. */}
            <h2 className="eyebrow mb-12" data-reveal-lift>
              Photographs
            </h2>
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {project.gallery.map((slide, index) => (
                <figure key={index} className="m-0" data-reveal>
                  <Frame
                    media={slide.image}
                    ratio="4/3"
                    seed={index + 1}
                    sizes={
                      "(min-width: 1400px) 640px, (min-width: 1024px) calc((100vw - 120px) / 2), (min-width: 768px) calc((100vw - 88px) / 2), calc(100vw - 48px)"
                    }
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
            {/* Straight marks, and the attribution outside the quote. A
                blockquote's `<footer>` is read as part of the quotation by
                some assistive technology, which attributes the speaker's own
                name to the speaker. */}
            <blockquote
              className="font-display leading-[1.15]"
              style={{ fontSize: "var(--text-display-3)" }}
              data-reveal
            >
              &quot;{project.testimonial.quote}&quot;
            </blockquote>
            <p
              className="text-bone/70 mt-8 font-mono text-xs tracking-[0.16em] uppercase"
              data-reveal
            >
              {project.testimonial.author} · {project.testimonial.role}
            </p>
          </div>
        </section>
      ) : null}

      {/* Omitted entirely for a collection of one, where both links would point
          at the page they are on (ADR-0015). */}
      {prev && next ? (
        <nav className="bg-bone border-line-2 border-t py-16" aria-label="Project navigation">
          <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-8 px-6 lg:px-10">
            <a href={prev.path} className="group flex items-center gap-5" rel="prev">
              {coverOf(prev.entry) ? (
                <div className="w-24 shrink-0 lg:w-32">
                  <Frame
                    media={coverOf(prev.entry)!}
                    ratio="4/3"
                    seed={1}
                    // A thumbnail is 96px, 128px above lg — a fixed size
                    // rather than a viewport fraction, because it does not
                    // grow with the window.
                    sizes="(min-width: 1024px) 128px, 96px"
                  />
                </div>
              ) : null}
              <div>
                <p className="text-ink-3 font-mono text-[10px] tracking-[0.18em] uppercase">
                  ← Previous
                </p>
                <p className="font-display text-ink group-hover:text-brass mt-2 text-2xl transition-colors">
                  {titleOf(prev.entry)}
                </p>
              </div>
            </a>
            <a
              href={next.path}
              className="group flex items-center justify-end gap-5 text-right"
              rel="next"
            >
              <div>
                <p className="text-ink-3 font-mono text-[10px] tracking-[0.18em] uppercase">
                  Next →
                </p>
                <p className="font-display text-ink group-hover:text-brass mt-2 text-2xl transition-colors">
                  {titleOf(next.entry)}
                </p>
              </div>
              {coverOf(next.entry) ? (
                <div className="w-24 shrink-0 lg:w-32">
                  <Frame
                    media={coverOf(next.entry)!}
                    ratio="4/3"
                    seed={2}
                    sizes="(min-width: 1024px) 128px, 96px"
                  />
                </div>
              ) : null}
            </a>
          </div>
        </nav>
      ) : null}
    </article>
  );
}

/** A neighbour's label — the same lenient read the page head uses, so a link
 * and the page it points at can never disagree about a project's name. */
function titleOf(entry: EntryComponentProps["entry"]): string {
  return summarizeProject(entry).title;
}

/**
 * A neighbour's cover, read leniently for the same reason its title is: this
 * runs for the entries either side of the one being rendered, and those are
 * savable half-written (ADR-0007). Narrowing with the full schema would mean a
 * finished project fails to build because the next one along has no cover yet.
 */
function coverOf(entry: EntryComponentProps["entry"]) {
  const parsed = mediaRef.safeParse((entry.fields as { cover?: unknown }).cover);
  return parsed.success ? parsed.data : null;
}
