import { describe, expect, it } from "vitest";
import { contentTypeFor } from "./contentTypes";

describe("contentTypeFor", () => {
  it("maps astro output extensions", () => {
    expect(contentTypeFor("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("styles/site.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("chunk.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeFor("favicon.svg")).toBe("image/svg+xml");
  });

  it("is case-insensitive on the extension", () => {
    expect(contentTypeFor("PHOTO.JPG")).toBe("image/jpeg");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(contentTypeFor("archive.wasm")).toBe("application/octet-stream");
    expect(contentTypeFor("no-extension")).toBe("application/octet-stream");
  });
});
