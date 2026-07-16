/**
 * The tenant edge router (ADR-0003, ADR-0004): resolve the request's
 * hostname through the TENANT_HOSTS KV map to `{workspaceId, versionNumber}`,
 * then serve the content-addressed build from R2 at
 * `tenants/{workspaceId}/v{N}/…`.
 *
 * Fails closed (ADR-0004): an unknown hostname or missing object is a 404 —
 * never a fallback that could cross tenants. The KV map is written by the
 * api's sync function on every promote; local dev seeds it with
 * `pnpm worker:sync`.
 */

interface TenantHostMapping {
  workspaceId: string;
  versionNumber: number;
}

/** Tenant-site policy, verbatim from ADR-0011: permissive baseline — the
 * renderer is the only script source and templates legitimately inline
 * styles; tightening per template is a stated future direction. */
const TENANT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.r2.cloudflarestorage.com",
  "connect-src 'self'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": TENANT_CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
} as const;

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);
    const mapping = await env.TENANT_HOSTS.get<TenantHostMapping>(url.hostname, "json");
    if (!mapping) return notFound();

    const object = await lookup(env.SITES, mapping, url.pathname);
    if (!object) return notFound();

    const headers = new Headers(SECURITY_HEADERS);
    const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
    headers.set("content-type", contentType);
    headers.set("etag", object.httpEtag);
    // v{N} paths are immutable, so non-HTML caches forever; HTML revalidates
    // every load so a promote is visible immediately (ADR-0003 defers HTML
    // edge caching to an explicit Cache Rule, never a default).
    headers.set(
      "cache-control",
      contentType.startsWith("text/html")
        ? "public, max-age=0, must-revalidate"
        : "public, max-age=31536000, immutable",
    );
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  },
} satisfies ExportedHandler<Env>;

function notFound(): Response {
  return new Response("Site not found", {
    status: 404,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Resolve a request path inside the version's R2 prefix. Directory-style
 * URLs fall back to their index.html (astro's default output format). */
async function lookup(
  bucket: R2Bucket,
  mapping: TenantHostMapping,
  rawPathname: string,
): Promise<R2ObjectBody | null> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  // The URL parser already collapses dot segments; this catches encoded ones.
  if (pathname.includes("..")) return null;

  const prefix = `tenants/${mapping.workspaceId}/v${mapping.versionNumber}`;
  const key = pathname.endsWith("/") ? `${prefix}${pathname}index.html` : `${prefix}${pathname}`;
  const object = await bucket.get(key);
  if (object) return object;

  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (!pathname.endsWith("/") && !lastSegment.includes(".")) {
    return bucket.get(`${prefix}${pathname}/index.html`);
  }
  return null;
}
