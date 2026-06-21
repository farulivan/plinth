import { MediaRef, type SectionComponentProps } from "@plinth/renderer";
import { heroSection } from "../manifest";

/** Norven hero — stub. Real layout/markup arrives with the content port. */
export function Hero({ section }: SectionComponentProps) {
  const { fields } = heroSection.parse(section);
  return (
    <section data-section="hero">
      <h1>{fields.title}</h1>
      {fields.tagline ? <p>{fields.tagline}</p> : null}
      <MediaRef media={fields.photo} />
    </section>
  );
}
