import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const HOST = "norven.localhost";
const BASE = `https://${HOST}`;
const TENANT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://*.r2.cloudflarestorage.com; connect-src 'self'; frame-ancestors 'self'";

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

  it("404s on a missing object within a mapped site", async () => {
    const response = await SELF.fetch(`${BASE}/nope.txt`);

    expect(response.status).toBe(404);
  });

  it("rejects encoded traversal attempts", async () => {
    const response = await SELF.fetch(`${BASE}/%2e%2e/ws-other/v1/index.html`);

    expect(response.status).toBe(404);
  });

  it("rejects non-read methods", async () => {
    const response = await SELF.fetch(`${BASE}/`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
});
