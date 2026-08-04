import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComponentMap } from "../componentMap";
import { Sections } from "./Sections";

const components: ComponentMap = {
  hero: ({ section }) => <h1>{(section.fields as { title: string }).title}</h1>,
  statement: ({ section }) => <p>{(section.fields as { body: string }).body}</p>,
};

const render = (sections: Parameters<typeof Sections>[0]["sections"]) =>
  renderToStaticMarkup(<Sections sections={sections} components={components} />);

describe("Sections", () => {
  it("renders sections in array order, which is render order", () => {
    const markup = render([
      { type: "statement", enabled: true, fields: { body: "second" } },
      { type: "hero", enabled: true, fields: { title: "first" } },
    ]);

    expect(markup.indexOf("second")).toBeLessThan(markup.indexOf("first"));
  });

  it("skips a disabled section", () => {
    expect(render([{ type: "hero", enabled: false, fields: { title: "hidden" } }])).toBe("");
  });

  // Forward compatibility: a snapshot written by a newer template can carry a
  // type this build has no component for, and a rollback can serve it.
  it("ignores an unknown section type rather than throwing", () => {
    expect(render([{ type: "nonexistent", enabled: true, fields: {} }])).toBe("");
  });

  it("renders nothing for an empty page", () => {
    expect(render([])).toBe("");
  });
});
