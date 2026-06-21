import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaRef } from "./MediaRef";

describe("MediaRef", () => {
  it("renders an img with the resolved src and the field's alt", () => {
    const html = renderToStaticMarkup(
      <MediaRef
        media={{ mediaId: "11111111-1111-1111-1111-111111111111", alt: "Salt House facade" }}
      />,
    );
    expect(html).toMatchInlineSnapshot(
      `"<link rel="preload" as="image" href="/media/11111111-1111-1111-1111-111111111111"/><img src="/media/11111111-1111-1111-1111-111111111111" alt="Salt House facade"/>"`,
    );
  });

  it("forwards extra img attributes but not src/alt", () => {
    const html = renderToStaticMarkup(
      <MediaRef media={{ mediaId: "abc", alt: "x" }} className="rounded" loading="lazy" />,
    );
    expect(html).toMatchInlineSnapshot(
      `"<img src="/media/abc" alt="x" class="rounded" loading="lazy"/>"`,
    );
  });
});
