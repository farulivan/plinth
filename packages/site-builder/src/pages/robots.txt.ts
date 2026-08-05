import type { APIRoute } from "astro";

import { siteUrl } from "../lib/snapshot";

/**
 * robots.txt, generated rather than shipped in `public/`.
 *
 * The sitemap line carries an absolute URL, so the file is per-tenant and only
 * knowable at build time — a static file would have to hardcode one tenant's
 * host and would then be wrong for every other tenant that copied it.
 *
 * The sitemap reference is omitted when the origin is unknown, since a
 * `Sitemap:` line pointing at the wrong host is worse than none.
 */
export const prerender = true;

export const GET: APIRoute = () => {
  const origin = siteUrl();
  const body = [
    "User-agent: *",
    "Allow: /",
    ...(origin ? ["", `Sitemap: ${new URL("/sitemap-index.xml", origin).href}`] : []),
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
