import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { templateBrandFor } from "./brand";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

describe("templateBrandFor", () => {
  it("resolves a public directory that exists and holds the template's icons", () => {
    const { publicDir } = templateBrandFor("template-norven");
    expect(existsSync(publicDir)).toBe(true);
    expect(readdirSync(publicDir).sort()).toEqual([
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
      "icon-192.png",
      "icon-512-maskable.png",
      "icon-512.png",
    ]);
  });

  it("declares every manifest icon as a file the template actually ships", () => {
    const { brand, publicDir } = templateBrandFor("template-norven");
    for (const icon of brand.manifest.icons) {
      expect(existsSync(join(publicDir, icon.src)), `${icon.src} is declared but missing`).toBe(
        true,
      );
    }
    for (const href of Object.values(brand.headIcons)) {
      expect(existsSync(join(publicDir, href)), `${href} is declared but missing`).toBe(true);
    }
  });

  it("refuses an unregistered template rather than defaulting to another's brand", () => {
    expect(() => templateBrandFor("template-someone-else")).toThrow(/no brand registered/);
  });

  /**
   * The regression this whole arrangement exists for. A public/ directory in
   * the builder is copied into EVERY tenant's output, so anything left here
   * becomes every customer's branding — which is exactly what happened: the
   * Astro scaffold's favicon shipped as the first tenant's mark, and the
   * standalone site's real icons were never carried across at all.
   */
  it("keeps the builder itself free of static files", () => {
    expect(existsSync(join(packageRoot, "public"))).toBe(false);
  });
});
