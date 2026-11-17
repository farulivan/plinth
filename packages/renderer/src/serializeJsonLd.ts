/**
 * Serializes structured data for the body of a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone isn't safe there. The HTML parser ends a script element
 * at the first `</script`, whatever its type, so a site name or project title
 * containing `</script>` would close the tag and the rest of the value would be
 * parsed as markup. Every `<` is written as `<` instead. A JSON parser reads
 * that as the same character, and the HTML parser never sees a tag. In valid
 * JSON a `<` can only appear inside a string, so the structure is untouched.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
