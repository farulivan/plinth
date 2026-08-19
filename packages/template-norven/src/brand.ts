/**
 * The template's brand surface: the `<head>` facts that describe the design
 * rather than the tenant's content.
 *
 * These live with the template because that is what they are — the same
 * decisions `styles.css` encodes, expressed for browser chrome instead of for
 * the page. Putting them in the site builder would have made one template's
 * palette the default for every template that came after it, which is the
 * shape the shipped favicon already had: the builder's `public/` directory
 * served Astro's scaffold logo as every tenant's brand mark.
 *
 * Tenant-authored art (Open Graph images, photography) does NOT belong here.
 * That goes through the media pipeline and is content, per-site and editable.
 * The line is ownership: a tenant can change its share image without changing
 * template; it cannot change its favicon without one.
 */
export const norvenBrand = {
  /**
   * Two `theme-color` metas rather than one, matching the standalone site.
   * A single value is wrong half the time: the tag paints the browser's own
   * chrome, so a light parchment bar sits under a dark-mode status bar and
   * reads as a rendering fault rather than a choice.
   */
  themeColor: { light: "#F4F1EA", dark: "#111110" },

  /** Icons declared in the page head, served from this package's `public/`. */
  headIcons: {
    svg: "/favicon.svg",
    ico: "/favicon.ico",
    appleTouch: "/apple-touch-icon.png",
  },

  /**
   * Web app manifest fields that are design decisions. `name` is deliberately
   * absent — it is the tenant's site name, so the endpoint reads it from the
   * document instead of freezing one studio's name into the template.
   */
  manifest: {
    themeColor: "#111110",
    backgroundColor: "#f4f1ea",
    display: "standalone",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
} as const;

export type NorvenBrand = typeof norvenBrand;
