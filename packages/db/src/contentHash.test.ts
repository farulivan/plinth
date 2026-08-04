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

  // A v2 document nests deeper than v1: pages hold sections, collections hold
  // entries hold fields. Both canonicalisation properties have to survive that
  // depth, because the hash gates publish idempotency and the preview channel.
  describe("under a nested document", () => {
    const page = (seo: Record<string, unknown>, sections: unknown[]) => ({
      id: "11111111-1111-4111-8111-111111111111",
      path: "/",
      seo,
      sections,
    });

    it("still ignores key order at every level", () => {
      const a = {
        schemaVersion: 2,
        site: { name: "N", description: "d" },
        pages: [page({ title: "t", noindex: false }, [{ type: "hero", fields: { a: 1, b: 2 } }])],
        collections: { projects: { pathTemplate: "/p/{slug}/", entries: [] } },
      };
      const b = {
        collections: { projects: { entries: [], pathTemplate: "/p/{slug}/" } },
        pages: [page({ noindex: false, title: "t" }, [{ fields: { b: 2, a: 1 }, type: "hero" }])],
        site: { description: "d", name: "N" },
        schemaVersion: 2,
      };
      expect(contentHash(a)).toBe(contentHash(b));
    });

    // Entry order is prev/next order and index order, so reordering entries is
    // a real content change even though the set is identical.
    it("still treats reordered collection entries as a change", () => {
      const withEntries = (slugs: string[]) => ({
        collections: { projects: { entries: slugs.map((slug) => ({ slug })) } },
      });
      expect(contentHash(withEntries(["a", "b"]))).not.toBe(contentHash(withEntries(["b", "a"])));
    });

    // The upgrade path is what makes this matter: if a v1 row and its upgraded
    // v2 form hashed the same, nothing downstream could tell them apart.
    it("distinguishes a v1 document from its v2 upgrade", () => {
      const v1 = { schemaVersion: 1, sections: [{ type: "hero", fields: {} }] };
      const v2 = {
        schemaVersion: 2,
        site: { name: "", description: "" },
        pages: [page({ noindex: false }, v1.sections)],
        collections: {},
      };
      expect(contentHash(v1)).not.toBe(contentHash(v2));
    });
  });
});
