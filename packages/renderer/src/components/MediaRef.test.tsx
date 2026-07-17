import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaRef } from "./MediaRef";

const HASH = "a".repeat(64);

const media = (width: number, height: number) => ({
  mediaId: "11111111-1111-1111-1111-111111111111",
  alt: "Salt House facade",
  contentHash: HASH,
  width,
  height,
});

describe("MediaRef", () => {
  it("renders a picture with avif/webp sources and a jpeg fallback carrying alt + dimensions", () => {
    const html = renderToStaticMarkup(<MediaRef media={media(1600, 1200)} loading="lazy" />);

    expect(html).toContain('<source type="image/avif"');
    expect(html).toContain('<source type="image/webp"');
    expect(html).toContain(`src="/_media/${HASH}/w1600.jpeg"`);
    expect(html).toContain(
      `srcSet="/_media/${HASH}/w400.avif 400w, /_media/${HASH}/w800.avif 800w, /_media/${HASH}/w1200.avif 1200w, /_media/${HASH}/w1600.avif 1600w"`,
    );
    expect(html).toContain('alt="Salt House facade"');
    expect(html).toContain('width="1600" height="1200"');
  });

  it("lists only the widths that exist — never an upscale", () => {
    const html = renderToStaticMarkup(<MediaRef media={media(1000, 750)} />);

    expect(html).toContain(`src="/_media/${HASH}/w800.jpeg"`);
    expect(html).not.toContain("w1200");
    expect(html).not.toContain("w1600");
  });

  it("keeps one variant for originals smaller than the smallest width", () => {
    const html = renderToStaticMarkup(<MediaRef media={media(300, 200)} />);

    expect(html).toContain(`src="/_media/${HASH}/w400.jpeg"`);
    expect(html).not.toContain("w800");
  });

  it("forwards extra img attributes but never src/alt/srcSet", () => {
    const html = renderToStaticMarkup(<MediaRef media={media(400, 300)} className="rounded" />);

    expect(html).toContain('class="rounded"');
    expect(html).toContain('alt="Salt House facade"');
  });
});
