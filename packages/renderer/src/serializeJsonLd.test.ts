import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./serializeJsonLd";

describe("serializeJsonLd", () => {
  const data = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: "Studio </script><script>alert(1)</script>",
    description: "<!-- not a comment -->",
  };

  it("never emits a sequence that can close or comment out the script tag", () => {
    const json = serializeJsonLd(data);
    expect(json).not.toContain("<");
    expect(json).toContain("\\u003c/script>");
  });

  it("parses back to the same data", () => {
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
