/**
 * Resolves a media row id to a URL the published site can load.
 *
 * MVP is the identity transform (ADR-0006/0007): a stable root-relative path
 * the tenant site's edge worker maps to the right R2 object. No CDN
 * resize/format params yet — they arrive with the media pipeline, behind this
 * same signature so call sites never change.
 */
export function resolveImageUrl(mediaId: string): string {
  return `/media/${mediaId}`;
}
