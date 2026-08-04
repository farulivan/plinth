import { describe, expect, it } from "vitest";

import {
  HOME_PATH,
  looseContentDocumentV2,
  parseContentDocument,
  safeParseContentDocument,
  upgradeV1toV2,
} from "./document";

const v1 = {
  schemaVersion: 1 as const,
  sections: [
    { type: "photoHero", enabled: true, fields: { title: "Architecture" } },
    { type: "statement", enabled: true, fields: { body: "A practice." } },
  ],
};

const v2 = {
  schemaVersion: 2 as const,
  site: { name: "Norven", description: "An architecture practice", nav: [], social: [] },
  pages: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      path: "/",
      enabled: true,
      seo: { noindex: false },
      sections: [{ type: "photoHero", enabled: true, fields: { title: "Architecture" } }],
    },
  ],
  collections: {},
};

describe("parseContentDocument", () => {
  it("upgrades a v1 document into a single home page", () => {
    const parsed = parseContentDocument(v1);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0]?.path).toBe(HOME_PATH);
    expect(parsed.pages[0]?.sections).toHaveLength(2);
  });

  it("passes a v2 document through unchanged", () => {
    expect(parseContentDocument(v2).pages[0]?.id).toBe(v2.pages[0]?.id);
  });

  // Rollback selects any retained snapshot and rebuilds nothing, so a v1
  // snapshot written ten publishes ago has to still parse. This is the
  // assertion that makes deleting the v1 branch fail loudly (docs/migrations.md).
  it("still accepts v1 when the version field is absent, as the earliest rows are", () => {
    const parsed = parseContentDocument({ sections: v1.sections });

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.pages[0]?.sections).toHaveLength(2);
  });

  // A non-deterministic upgrade would change contentHash on every read, which
  // surfaces as permanent "unpublished changes" and a preview reload loop.
  it("upgrades deterministically, so repeated reads hash identically", () => {
    expect(JSON.stringify(parseContentDocument(v1))).toBe(JSON.stringify(parseContentDocument(v1)));
  });

  it("leaves site settings blank rather than inventing them", () => {
    const upgraded = upgradeV1toV2(v1);

    expect(upgraded.site.name).toBe("");
    expect(upgraded.site.description).toBe("");
  });

  // The failure this guards against bricks a draft rather than rejecting it:
  // an upgraded document that the loose envelope refuses would parse once,
  // save, and then fail every subsequent read, with the row already written.
  it("produces an upgrade the loose envelope accepts, so it survives a round trip", () => {
    const upgraded = parseContentDocument(v1);
    const roundTripped = looseContentDocumentV2.safeParse(JSON.parse(JSON.stringify(upgraded)));

    expect(roundTripped.success).toBe(true);
  });

  // Storage is the loose half of the loose-save / strict-publish split: an
  // author mid-edit has an empty field, and losing their work over it is worse
  // than publishing being refused later.
  it("stores blank site settings, leaving the publish gate to require them", () => {
    expect(
      looseContentDocumentV2.safeParse({ ...v2, site: { name: "", description: "" } }).success,
    ).toBe(true);
  });

  it("rejects a document that is neither version", () => {
    expect(safeParseContentDocument({ schemaVersion: 99, pages: [] }).success).toBe(false);
    expect(safeParseContentDocument({}).success).toBe(false);
  });
});

describe("page and collection constraints", () => {
  const pageWith = (overrides: Record<string, unknown>) => ({
    ...v2,
    pages: [{ ...v2.pages[0], ...overrides }],
  });

  it("rejects two pages at the same path", () => {
    const result = looseContentDocumentV2.safeParse({
      ...v2,
      pages: [v2.pages[0], { ...v2.pages[0], id: "22222222-2222-4222-8222-222222222222" }],
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate page path");
  });

  it("rejects duplicate section types within a page", () => {
    const result = looseContentDocumentV2.safeParse(
      pageWith({
        sections: [
          { type: "photoHero", enabled: true, fields: {} },
          { type: "photoHero", enabled: true, fields: {} },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("unique per page");
  });

  // The same type on two different pages is the whole point of pages.
  it("allows the same section type on different pages", () => {
    const result = looseContentDocumentV2.safeParse({
      ...v2,
      pages: [
        v2.pages[0],
        {
          id: "33333333-3333-4333-8333-333333333333",
          path: "/studio/",
          enabled: true,
          seo: { noindex: false },
          sections: [{ type: "photoHero", enabled: true, fields: {} }],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it.each([["/studio"], ["studio/"], ["/Studio/"], ["/_media/x/"], ["/_astro/x/"]])(
    "rejects the malformed or reserved path %s",
    (path) => {
      expect(looseContentDocumentV2.safeParse(pageWith({ path })).success).toBe(false);
    },
  );

  it.each([["/"], ["/studio/"], ["/projects/salt-house/"]])("accepts the path %s", (path) => {
    expect(looseContentDocumentV2.safeParse(pageWith({ path })).success).toBe(true);
  });

  it("rejects duplicate entry slugs within a collection", () => {
    const entry = {
      id: "44444444-4444-4444-8444-444444444444",
      slug: "salt-house",
      enabled: true,
      seo: { noindex: false },
      fields: {},
    };
    const result = looseContentDocumentV2.safeParse({
      ...v2,
      collections: {
        projects: {
          pathTemplate: "/projects/{slug}/",
          entries: [entry, { ...entry, id: "55555555-5555-4555-8555-555555555555" }],
        },
      },
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate slug");
  });

  it("requires a path template that ends in the slug segment", () => {
    const withTemplate = (pathTemplate: string) =>
      looseContentDocumentV2.safeParse({
        ...v2,
        collections: { projects: { pathTemplate, entries: [] } },
      }).success;

    expect(withTemplate("/projects/{slug}/")).toBe(true);
    expect(withTemplate("/{slug}/")).toBe(true);
    expect(withTemplate("/projects/")).toBe(false);
    expect(withTemplate("/projects/{slug}")).toBe(false);
  });
});
