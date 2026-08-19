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
    <section className="bg-bone py-16 lg:py-24" data-section="projectIndex">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <h2 className="sr-only">{fields.heading}</h2>

        {cards.length === 0 ? (
          <p className="text-ink-3 text-base">No projects published yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
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
                    // Three columns above lg, two above sm. Stated per
                    // breakpoint so the browser picks against the slot it
                    // will actually occupy rather than the widest one.
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                  {/* Kind and year only. Status and area belong to the
                      project's own page — an index is a way in, and every
                      extra clause here is one more thing to read before
                      choosing which project to open. */}
                  <p className="eyebrow text-brass-2 mt-5">
                    {project.kind} · {project.year}
                  </p>
                  <h3 className="font-display text-ink group-hover:text-brass mt-1 text-2xl transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-ink-3 mt-1 font-mono text-xs tracking-[0.14em] uppercase">
                    {project.location}
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
