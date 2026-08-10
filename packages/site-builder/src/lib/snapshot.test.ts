import { describe, expect, it } from "vitest";

import { pageParam } from "./snapshot";

/**
 * The root case is the one worth a test. `[...path]` needs the parameter
 * absent to emit `index.html`; an empty string produces no route at all, so
 * returning `""` would silently drop the home page from the build while every
 * other page kept working — a site that publishes successfully and 404s at its
 * own front door.
 */
describe("pageParam", () => {
  it("returns undefined for the root, not an empty string", () => {
    expect(pageParam("/")).toBeUndefined();
  });

  it.each([
    ["/studio/", "studio"],
    ["/projects/salt-house/", "projects/salt-house"],
  ])("strips the surrounding slashes of %s", (path, expected) => {
    expect(pageParam(path)).toBe(expected);
  });
});
