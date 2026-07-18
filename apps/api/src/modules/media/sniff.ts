/**
 * Magic-byte MIME sniff (ADR-0006) — extension and declared content-type are
 * attacker-chosen, the first bytes are not. Only the formats Sharp will be
 * asked to decode; pure, so it tests without the adapter's env/S3 baggage.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (index: number) => bytes[index] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (start: number, text: string) =>
    text.split("").every((char, i) => at(start + i) === char.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp") && (ascii(8, "avif") || ascii(8, "avis"))) return "image/avif";
  return null;
}
