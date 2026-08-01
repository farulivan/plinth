import type { MetadataRoute } from "next";

/**
 * The dashboard is a private application — nothing here should be indexed.
 *
 * It also has to exist. Every path is protected (`protectedPaths: ["/"]`), so
 * without a real route `/robots.txt` resolves to the sign-in redirect and a
 * crawler receives an HTML login page where it asked for a text file.
 * `robots.txt` is declared public in the proxy for the same reason.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
