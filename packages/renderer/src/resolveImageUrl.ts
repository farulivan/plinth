/**
 * Resolves a media variant to the URL a rendered page loads it from.
 *
 * Same-origin by design (ADR-0014): `/_media/{contentHash}/w{width}.{format}`
 * — the worker-router maps it into the media bucket using the hostname's
 * workspace, and the dashboard proxies the identical path for previews. No
 * base URL, no env: content-addressed paths are immutable and the origin
 * decides the tenant. The signature is the kept seam from ADR-0007 — a
 * future signed-URL gate changes this function, never its call sites.
 */
export function resolveImageUrl(contentHash: string, width: number, format: string): string {
  return `/_media/${contentHash}/w${width}.${format}`;
}
