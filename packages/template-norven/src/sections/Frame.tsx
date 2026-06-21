import type { SectionComponentProps } from "@plinth/renderer";
import { frameSection } from "../manifest";

/** Norven frame (closing call-to-action) — stub. Real layout/markup arrives
 * with the content port. */
export function Frame({ section }: SectionComponentProps) {
  const { fields } = frameSection.parse(section);
  return (
    <section data-section="frame">
      <h2>{fields.heading}</h2>
      <p>{fields.body}</p>
      <a href={fields.cta.href}>{fields.cta.label}</a>
    </section>
  );
}
