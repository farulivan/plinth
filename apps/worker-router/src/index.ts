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
  /**
   * Origins this tenant's pages are allowed to post a form to, written by the
   * api's sync when the published snapshot carries a delivery key (ADR-0011).
   *
   * A delta rather than a whole policy. Storing the finished CSP per tenant
   * would put the security posture in data instead of code: every future
   * tightening would need a re-sync of every tenant to take effect, and a
   * stale KV entry would quietly keep serving last month's policy. Storing
   * only what a tenant additionally needs keeps the policy reviewable in one
   * file, and a stale entry can only be wrong about a form.
   */
  formOrigins?: string[];
}

/**
 * Origins a tenant may be granted. The allowlist is the point — `formOrigins`
 * comes from KV, so without it a bad write could widen a tenant's policy to
 * anywhere, and KV has no schema of its own to stop that.
 *
 * Duplicated from `CONTACT_FORM_ORIGIN` in @plinth/schema on purpose: this
 * worker ships with no runtime dependencies, and importing the schema package
 * would pull zod into a bundle that exists to stay small. The duplication is
 * held honest by a test, which may import what the bundle may not.
 */
const ALLOWED_FORM_ORIGINS = ["https://api.web3forms.com"];

/** Tenant-site policy (ADR-0011): permissive on script and style — the
 * renderer is the only script source and templates legitimately inline styles
 * — and closed everywhere else. Per-template tightening of the two `'unsafe-
 * inline'` directives remains the stated future direction.
 *
 * `font-src` carries `data:` because Astro's CSS bundler base64-inlines small
 * font subsets rather than emitting a file for them. Without it those faces
 * inherit `default-src 'self'`, which excludes `data:`, and the browser blocks
 * a font the page legitimately ships. */
function tenantCsp(formOrigins: string[] = []): string {
  // Only tenants that actually publish a form get the endpoint, which is the
  // whole reason this is per-tenant: a site with no form has no business
  // being able to reach a form service, and most tenants have no form.
  const allowed = formOrigins.filter((origin) => ALLOWED_FORM_ORIGINS.includes(origin));
  const extra = allowed.length > 0 ? ` ${allowed.join(" ")}` : "";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.r2.cloudflarestorage.com",
    "font-src 'self' data:",
    // connect-src covers the enhanced fetch, form-action the native POST the
    // page falls back to without JavaScript. Granting one without the other
    // breaks exactly half the form, in whichever half nobody tested.
    `connect-src 'self'${extra}`,
    `form-action 'self'${extra}`,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

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
 * duplicate the header on tenant responses.
 *
 * Takes the mapping so the CSP can carry that tenant's form allowance. A
 * response with no mapping — an unknown hostname — gets the base policy,
 * which is the tightest one.
 */
function securityHeaders(mapping?: TenantHostMapping): Record<string, string> {
  return {
    "content-security-policy": tenantCsp(mapping?.formOrigins),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": PERMISSIONS_POLICY,
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
  };
}

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
      return serveMedia(env.MEDIA, mapping, url.pathname, request.method === "HEAD");
    }

    const object = await lookup(env.SITES, mapping, url.pathname);
    if (!object) return tenantNotFound(env.SITES, mapping, request.method === "HEAD");

    const headers = new Headers(securityHeaders(mapping));
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
  // Still this tenant's response, so it keeps this tenant's policy. Falling
  // back to the base one would mean a host's CSP depended on whether its
  // build happened to include a 404 page.
  if (!page) return notFound(mapping);

  return new Response(isHead ? null : page.body, {
    status: 404,
    headers: {
      ...securityHeaders(mapping),
      "content-type": page.httpMetadata?.contentType ?? "text/html; charset=utf-8",
      "cache-control": REVALIDATE,
    },
  });
}

const MEDIA_PATH = /^\/_media\/([0-9a-f]{64})\/(w\d{3,4}\.(?:avif|webp|jpeg))$/;

async function serveMedia(
  bucket: R2Bucket,
  mapping: TenantHostMapping,
  pathname: string,
  isHead: boolean,
): Promise<Response> {
  const match = MEDIA_PATH.exec(pathname);
  if (!match) return notFound(mapping);
  const [, contentHash, variant] = match;

  const object = await bucket.get(`tenants/${mapping.workspaceId}/${contentHash}/${variant}`);
  if (!object) return notFound(mapping);

  const headers = new Headers(securityHeaders(mapping));
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("etag", object.httpEtag);
  // Content-addressed: the bytes behind this URL can never change.
  headers.set("cache-control", IMMUTABLE);
  return new Response(isHead ? null : object.body, { headers });
}

function notFound(mapping?: TenantHostMapping): Response {
  return new Response("Site not found", {
    status: 404,
    headers: {
      ...securityHeaders(mapping),
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
