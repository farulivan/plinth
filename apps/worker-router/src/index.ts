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

/** Tenant-site policy (ADR-0011): permissive on script and style — the
 * renderer is the only script source and templates legitimately inline styles
 * — and closed everywhere else. Per-template tightening of the two `'unsafe-
 * inline'` directives remains the stated future direction.
 *
 * `font-src` carries `data:` because Astro's CSS bundler base64-inlines small
 * font subsets rather than emitting a file for them. Without it those faces
 * inherit `default-src 'self'`, which excludes `data:`, and the browser blocks
 * a font the page legitimately ships. */
const TENANT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.r2.cloudflarestorage.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** Deny-list mirroring the first tenant's production posture. Nothing the
 * renderer emits asks for any of these, so granting none of them costs a
 * template nothing and removes the surface from an injected script. */
const PERMISSIONS_POLICY = [
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "battery",
  "camera",
  "display-capture",
  "document-domain",
  "encrypted-media",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "picture-in-picture",
  "publickey-credentials-get",
  "usb",
  "xr-spatial-tracking",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

/** Strict-Transport-Security is deliberately absent: it is a zone-level
 * Cloudflare setting covering every host, and emitting it here as well would
 * duplicate the header on tenant responses. */
const SECURITY_HEADERS = {
  "content-security-policy": TENANT_CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": PERMISSIONS_POLICY,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
} as const;

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=0, must-revalidate";

/**
 * Caching keys off the path, not the content type. Only two prefixes carry a
 * digest in the URL — Astro's bundled assets and content-addressed media — so
 * only those can promise immutability. Everything else lives at a stable path
 * whose bytes change on the next publish: `sitemap.xml`, `robots.txt`,
 * `favicon.ico`, a web manifest. Keying off `text/html` would have frozen all
 * of them at the edge for a year, and the failure only shows up as a stale
 * file nobody can flush.
 */
function cacheControlFor(pathname: string): string {
  return pathname.startsWith("/_astro/") || pathname.startsWith("/_media/")
    ? IMMUTABLE
    : REVALIDATE;
}

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
    // No mapping means no tenant, so there is no tenant 404 page to reach for.
    if (!mapping) return notFound();

    // Media variants (ADR-0014): same-origin /_media paths resolve into the
    // media bucket under the hostname's workspace — cross-tenant reads are
    // impossible by construction, and version paths never collide with the
    // reserved /_media prefix.
    if (url.pathname.startsWith("/_media/")) {
      return serveMedia(env.MEDIA, mapping.workspaceId, url.pathname, request.method === "HEAD");
    }

    const object = await lookup(env.SITES, mapping, url.pathname);
    if (!object) return tenantNotFound(env.SITES, mapping, request.method === "HEAD");

    const headers = new Headers(SECURITY_HEADERS);
    headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", cacheControlFor(url.pathname));
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  },
} satisfies ExportedHandler<Env>;

/** A miss inside a mapped site renders that site's own 404 page when the build
 * produced one, so a wrong URL stays inside the tenant's design instead of
 * dropping to the platform's plain text. Still fails closed: the fallback is
 * the same generic 404, never another tenant's content. */
async function tenantNotFound(
  bucket: R2Bucket,
  mapping: TenantHostMapping,
  isHead: boolean,
): Promise<Response> {
  const page = await bucket.get(
    `tenants/${mapping.workspaceId}/v${mapping.versionNumber}/404.html`,
  );
  if (!page) return notFound();

  return new Response(isHead ? null : page.body, {
    status: 404,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": page.httpMetadata?.contentType ?? "text/html; charset=utf-8",
      "cache-control": REVALIDATE,
    },
  });
}

const MEDIA_PATH = /^\/_media\/([0-9a-f]{64})\/(w\d{3,4}\.(?:avif|webp|jpeg))$/;

async function serveMedia(
  bucket: R2Bucket,
  workspaceId: string,
  pathname: string,
  isHead: boolean,
): Promise<Response> {
  const match = MEDIA_PATH.exec(pathname);
  if (!match) return notFound();
  const [, contentHash, variant] = match;

  const object = await bucket.get(`tenants/${workspaceId}/${contentHash}/${variant}`);
  if (!object) return notFound();

  const headers = new Headers(SECURITY_HEADERS);
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("etag", object.httpEtag);
  // Content-addressed: the bytes behind this URL can never change.
  headers.set("cache-control", IMMUTABLE);
  return new Response(isHead ? null : object.body, { headers });
}

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
