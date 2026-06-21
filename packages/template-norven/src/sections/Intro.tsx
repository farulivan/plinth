import type { SectionComponentProps } from "@plinth/renderer";
import { introSection } from "../manifest";

/** Norven intro — stub. Real layout/markup arrives with the content port. */
export function Intro({ section }: SectionComponentProps) {
  const { fields } = introSection.parse(section);
  return (
    <section data-section="intro">
      <h2>{fields.heading}</h2>
      <p>{fields.body}</p>
    </section>
  );
}
