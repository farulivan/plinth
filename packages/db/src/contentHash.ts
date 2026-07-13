import { createHash } from "node:crypto";

/**
 * SHA-256 of the canonical JSON encoding of a content document. Object keys
 * are sorted recursively so two structurally equal documents hash identically
 * regardless of key insertion order; array order stays significant because
 * section order IS render order (ADR-0001). This is the hash stored on
 * content_versions.content_hash (content addressing, ADR-0003) and carried in
 * preview draft-updated events so the iframe can skip no-op reloads
 * (ADR-0007).
 */
export function contentHash(document: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(document)))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, canonicalize(inner)]),
    );
  }
  return value;
}
