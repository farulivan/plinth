import { describe, expect, it } from "vitest";
import { contentHash } from "./contentHash";

describe("contentHash", () => {
  it("returns a sha256 hex digest", () => {
    expect(contentHash({ sections: [] })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across object key order, recursively", () => {
    const a = {
      schemaVersion: 1,
      sections: [{ type: "intro", fields: { heading: "x", body: "y" } }],
    };
    const b = {
      sections: [{ fields: { body: "y", heading: "x" }, type: "intro" }],
      schemaVersion: 1,
    };
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("changes when any value changes", () => {
    const base = { sections: [{ type: "intro", fields: { heading: "x" } }] };
    const edited = { sections: [{ type: "intro", fields: { heading: "y" } }] };
    expect(contentHash(base)).not.toBe(contentHash(edited));
  });

  it("treats array order as significant", () => {
    expect(contentHash({ sections: ["a", "b"] })).not.toBe(contentHash({ sections: ["b", "a"] }));
  });
});
