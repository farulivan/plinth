import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const HOST = "norven.localhost";
const BASE = `https://${HOST}`;
const MEDIA_HASH = "b".repeat(64);
const TENANT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://*.r2.cloudflarestorage.com; font-src 'self' data:; " +
  "connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; " +
  "frame-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests";

// Each test gets isolated storage (vitest-pool-workers default), so the
// mapped hostname and a small v3 site are seeded fresh every time.
beforeEach(async () => {
  await env.TENANT_HOSTS.put(HOST, JSON.stringify({ workspaceId: "ws-norven", versionNumber: 3 }));
  await env.SITES.put("tenants/ws-norven/v3/index.html", "<!doctype html><h1>v3 home</h1>", {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await env.SITES.put("tenants/ws-norven/v3/about/index.html", "<!doctype html><h1>about</h1>", {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await env.SITES.put("tenants/ws-norven/v3/_astro/site.a1b2c3.css", "body{margin:0}", {
    httpMetadata: { contentType: "text/css; charset=utf-8" },
  });
  // Stable paths whose bytes change per publish — the cache-control cases below.
  await env.SITES.put("tenants/ws-norven/v3/sitemap.xml", "<urlset/>", {
    httpMetadata: { contentType: "application/xml" },
  });
  await env.SITES.put("tenants/ws-norven/v3/robots.txt", "User-agent: *", {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  await env.SITES.put("tenants/ws-norven/v3/favicon.ico", "icon-bytes", {
    httpMetadata: { contentType: "image/x-icon" },
  });
  await env.MEDIA.put(`tenants/ws-norven/${MEDIA_HASH}/w400.webp`, "not-really-webp", {
    httpMetadata: { contentType: "image/webp" },
  });
});

describe("worker-router", () => {
  it("serves the mapped version's index with tenant security headers", async () => {
    const response = await SELF.fetch(`${BASE}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("v3 home");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBe(TENANT_CSP);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("fails closed on an unmapped hostname", async () => {
    const response = await SELF.fetch("https://unknown.localhost/");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toBe(TENANT_CSP);
  });

  it("resolves directory-style URLs to their index.html, with and without a slash", async () => {
    const withSlash = await SELF.fetch(`${BASE}/about/`);
    const withoutSlash = await SELF.fetch(`${BASE}/about`);

    expect(withSlash.status).toBe(200);
    expect(withoutSlash.status).toBe(200);
    // Read both bodies: an undrained R2 stream keeps a storage handle open
    // and fails the pool's isolated-storage teardown.
    expect(await withSlash.text()).toContain("about");
    expect(await withoutSlash.text()).toContain("about");
  });

  it("caches immutable assets hard and HTML not at all", async () => {
    const asset = await SELF.fetch(`${BASE}/_astro/site.a1b2c3.css`);
    const html = await SELF.fetch(`${BASE}/`);

    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(html.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    await asset.text();
    await html.text();
  });

  // The regression this guards is silent and lasts a year: these live at stable
  // paths but their bytes change on the next publish, so caching them by
  // content type — they are not text/html — froze them at the edge.
  it("revalidates non-HTML files that sit outside the digest-named prefixes", async () => {
    const sitemap = await SELF.fetch(`${BASE}/sitemap.xml`);
    const robots = await SELF.fetch(`${BASE}/robots.txt`);
    const favicon = await SELF.fetch(`${BASE}/favicon.ico`);

    for (const response of [sitemap, robots, favicon]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
      await response.text();
    }
  });

  it("ships the full tenant header contract on every response", async () => {
    const response = await SELF.fetch(`${BASE}/`);

    expect(response.headers.get("content-security-policy")).toBe(TENANT_CSP);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    // Zone-level on Cloudflare; emitting it here too would duplicate it.
    expect(response.headers.get("strict-transport-security")).toBeNull();
    await response.text();
  });

  it("allows data: fonts, which astro inlines for small subsets", async () => {
    const response = await SELF.fetch(`${BASE}/`);

    expect(response.headers.get("content-security-policy")).toContain("font-src 'self' data:");
    await response.text();
  });

  it("serves the tenant's own 404 page when the build produced one", async () => {
    await env.SITES.put("tenants/ws-norven/v3/404.html", "<!doctype html><h1>tenant 404</h1>", {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });

    const response = await SELF.fetch(`${BASE}/no-such-page`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(await response.text()).toContain("tenant 404");
  });

  it("falls back to the generic 404 when the build has no 404 page", async () => {
    const response = await SELF.fetch(`${BASE}/no-such-page`);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Site not found");
  });

  // Fail-closed still governs: a tenant 404 page must never answer for a
  // hostname that resolves to no tenant at all.
  it("never reaches for a 404 page on an unmapped hostname", async () => {
    await env.SITES.put("tenants/ws-norven/v3/404.html", "<!doctype html><h1>tenant 404</h1>", {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });

    const response = await SELF.fetch("https://unknown.localhost/");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Site not found");
  });

  it("404s on a missing object within a mapped site", async () => {
    const response = await SELF.fetch(`${BASE}/nope.txt`);

    expect(response.status).toBe(404);
  });

  it("rejects encoded traversal attempts", async () => {
    const response = await SELF.fetch(`${BASE}/%2e%2e/ws-other/v1/index.html`);

    expect(response.status).toBe(404);
  });

  it("serves media variants from the hostname's workspace, cached immutably", async () => {
    const response = await SELF.fetch(`${BASE}/_media/${MEDIA_HASH}/w400.webp`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe("not-really-webp");
  });

  it("404s media paths that don't match the variant shape or don't exist", async () => {
    const malformed = await SELF.fetch(`${BASE}/_media/not-a-hash/w400.webp`);
    const missing = await SELF.fetch(`${BASE}/_media/${"c".repeat(64)}/w400.webp`);

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("rejects non-read methods", async () => {
    const response = await SELF.fetch(`${BASE}/`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
