import { MediaRef, type SectionComponentProps } from "@plinth/renderer";
import { projectsSection } from "../manifest";

/** Norven projects — stub. Real layout/markup arrives with the content port. */
export function Projects({ section }: SectionComponentProps) {
  const { fields } = projectsSection.parse(section);
  return (
    <section data-section="projects">
      <h2>{fields.heading}</h2>
      <ul>
        {fields.items.map((item, index) => (
          <li key={index}>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <MediaRef media={item.image} />
          </li>
        ))}
      </ul>
    </section>
  );
}
