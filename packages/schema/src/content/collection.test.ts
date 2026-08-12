import { describe, expect, it } from "vitest";
import { livingEntries, resolveEntryPath, withNeighbors, type EntryInstance } from "./collection";

const entry = (slug: string, enabled = true): EntryInstance => ({
  id: `00000000-0000-4000-8000-${slug.padEnd(12, "0").slice(0, 12)}`,
  slug,
  enabled,
  seo: { noindex: false },
  fields: {},
});

const collectionOf = (...entries: EntryInstance[]) => ({
  pathTemplate: "/projects/{slug}/",
  entries,
});

describe("resolveEntryPath", () => {
  it("substitutes the slug segment", () => {
    expect(resolveEntryPath("/projects/{slug}/", "salt-house")).toBe("/projects/salt-house/");
    expect(resolveEntryPath("/{slug}/", "salt-house")).toBe("/salt-house/");
  });
});

describe("livingEntries", () => {
  it("resolves a path per entry, in array order", () => {
    expect(livingEntries(collectionOf(entry("b"), entry("a"))).map((item) => item.path)).toEqual([
      "/projects/b/",
      "/projects/a/",
    ]);
  });

  // Filtering once, here, is what keeps the three consumers agreeing: the
  // build emits no page for a parked entry, the index must not link to one,
  // and prev/next must not walk through one.
  it("drops parked entries", () => {
    const entries = livingEntries(collectionOf(entry("a"), entry("b", false), entry("c")));
    expect(entries.map((item) => item.entry.slug)).toEqual(["a", "c"]);
  });
});

describe("withNeighbors", () => {
  it("wraps around, so the sequence has no dead end", () => {
    const chain = withNeighbors(livingEntries(collectionOf(entry("a"), entry("b"), entry("c"))));

    expect(chain.map((item) => item.entry.slug)).toEqual(["a", "b", "c"]);
    expect(chain[0]!.prev?.entry.slug).toBe("c");
    expect(chain[0]!.next?.entry.slug).toBe("b");
    expect(chain[2]!.next?.entry.slug).toBe("a");
  });

  // Two entries are each other's prev AND next. That is what a cycle of two
  // is, not a bug to special-case.
  it("points both ways at the other entry when there are two", () => {
    const chain = withNeighbors(livingEntries(collectionOf(entry("a"), entry("b"))));
    expect(chain[0]!.prev?.entry.slug).toBe("b");
    expect(chain[0]!.next?.entry.slug).toBe("b");
  });

  // The cycle degenerates here: both links would point at the page they are
  // on, and a "next project" that reloads the same project reads as broken.
  it("gives a lone entry no neighbours at all", () => {
    const chain = withNeighbors(livingEntries(collectionOf(entry("a"))));
    expect(chain[0]!.prev).toBeNull();
    expect(chain[0]!.next).toBeNull();
  });

  it("never walks through a parked entry", () => {
    const chain = withNeighbors(
      livingEntries(collectionOf(entry("a"), entry("b", false), entry("c"))),
    );
    expect(chain[0]!.next?.entry.slug).toBe("c");
    expect(chain[1]!.next?.entry.slug).toBe("a");
  });

  it("handles an empty collection", () => {
    expect(withNeighbors([])).toEqual([]);
  });
});
