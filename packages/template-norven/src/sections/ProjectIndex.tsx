import type { SectionComponentProps } from "@plinth/renderer";
import { projectEntryFields, projectIndexSection } from "../manifest";
import { Frame } from "../media/Frame";

/**
 * The grid of every project, ported from projects/index.astro.
 *
 * Entries arrive already resolved and already filtered — the section never
 * sees a parked project and never builds a path, which is what keeps this a
 * component that draws links rather than one that knows how a collection is
 * addressed.
 *
 * Fields are parsed per entry rather than for the collection as a whole. A
 * half-written project is savable by design (ADR-0007), so one that cannot be
 * narrowed yet is skipped here instead of throwing: an index that refuses to
 * render because a draft entry is incomplete would take the finished projects
 * down with it, in the preview, while the author is still typing.
 */
export function ProjectIndex({ section, collections }: SectionComponentProps) {
  const { fields } = projectIndexSection.parse(section);
  const entries = collections?.[fields.collection] ?? [];

  const cards = entries.flatMap(({ path, entry }) => {
    const parsed = projectEntryFields.safeParse(entry.fields);
    return parsed.success ? [{ path, fields: parsed.data }] : [];
  });

  return (
    <section className="bg-bone py-24 lg:py-32" data-section="projectIndex">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        {fields.eyebrow ? (
          <p className="eyebrow text-brass-2 mb-5" data-reveal>
            {fields.eyebrow}
          </p>
        ) : null}
        <h2
          className="font-display text-ink mb-16 leading-[0.98]"
          style={{ fontSize: "var(--text-display-2)" }}
          data-reveal-lift
        >
          {fields.heading}
        </h2>

        {cards.length === 0 ? (
          <p className="text-ink-3 text-base">No projects published yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2">
            {cards.map(({ path, fields: project }, index) => (
              <li key={path} data-reveal>
                <a href={path} className="group block">
                  <Frame
                    media={project.cover}
                    ratio="4/3"
                    seed={index}
                    // The first card is above the fold and is the LCP element
                    // on this page. Without this it inherits `loading="lazy"`
                    // and the browser deprioritises the one image the score
                    // is measured on.
                    priority={index === 0}
                    // 46vw, not 50vw: two columns inside a 1400px container
                    // with 40px of side padding and a 40px gap leaves each
                    // slot narrower than half the viewport. Overstating it
                    // makes the browser reach for a wider variant than the
                    // slot can use.
                    sizes="(min-width: 768px) 46vw, 100vw"
                  />
                  <p className="eyebrow text-brass-2 mt-6 mb-3">
                    {project.kind} · {project.year} · {project.status}
                  </p>
                  <h3
                    className="font-display text-ink group-hover:text-brass-2 leading-[0.98] transition-colors"
                    style={{ fontSize: "var(--text-display-3)" }}
                  >
                    {project.title}
                  </h3>
                  <p className="text-ink-3 mt-3 font-mono text-xs tracking-[0.14em] uppercase">
                    {project.location} · {project.area}
                  </p>
                  <p className="text-ink-3 mt-5 max-w-md text-base leading-relaxed">
                    {project.brief}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
