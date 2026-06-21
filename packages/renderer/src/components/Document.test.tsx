import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LooseContentDocument } from "@plinth/schema/content";
import type { ComponentMap, SectionComponentProps } from "../componentMap";
import { Document } from "./Document";

function Hero({ section }: SectionComponentProps) {
  return <h1 data-type={section.type}>hero</h1>;
}
function Intro({ section }: SectionComponentProps) {
  return <p data-type={section.type}>intro</p>;
}

const components: ComponentMap = { hero: Hero, intro: Intro };

describe("Document", () => {
  it("renders enabled sections in array order, skipping disabled and unknown", () => {
    const doc: LooseContentDocument = {
      schemaVersion: 1,
      sections: [
        { type: "hero", enabled: true, fields: {} },
        { type: "intro", enabled: false, fields: {} },
        { type: "mystery", enabled: true, fields: {} },
      ],
    };
    expect(
      renderToStaticMarkup(<Document document={doc} components={components} />),
    ).toMatchInlineSnapshot(`"<h1 data-type="hero">hero</h1>"`);
  });
});
