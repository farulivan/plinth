import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SectionInstance } from "@plinth/schema/content";
import type { ComponentMap, SectionComponentProps } from "../componentMap";
import { Section } from "./Section";

function Hero({ section }: SectionComponentProps) {
  return <h1 data-type={section.type}>hero</h1>;
}

const components: ComponentMap = { hero: Hero };

describe("Section", () => {
  it("renders the mapped component for a known, enabled section", () => {
    const section: SectionInstance = { type: "hero", enabled: true, fields: {} };
    expect(
      renderToStaticMarkup(<Section section={section} components={components} />),
    ).toMatchInlineSnapshot(`"<h1 data-type="hero">hero</h1>"`);
  });

  it("renders nothing for a disabled section", () => {
    const section: SectionInstance = { type: "hero", enabled: false, fields: {} };
    expect(renderToStaticMarkup(<Section section={section} components={components} />)).toBe("");
  });

  it("renders nothing for an unknown section type", () => {
    const section: SectionInstance = { type: "mystery", enabled: true, fields: {} };
    expect(renderToStaticMarkup(<Section section={section} components={components} />)).toBe("");
  });
});
