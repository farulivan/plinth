import type { ImgHTMLAttributes } from "react";
import { variantWidthsFor } from "@plinth/schema/api";
import type { MediaRef as MediaRefValue } from "@plinth/schema/content";
import { resolveImageUrl } from "../resolveImageUrl";

type MediaRefProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "srcSet"> & {
  media: MediaRefValue;
};

/**
 * Renders a media reference as a responsive <picture>: AVIF and WebP sources
 * plus a JPEG <img> fallback, all derived from the field's contentHash
 * (ADR-0006 — Norven's shape verbatim). Alt lives on the field and is
 * schema-required, so it is always present; width/height come from the
 * original so the browser reserves layout space before the image loads.
 * `src`/`alt`/`srcSet` are derived here and cannot be overridden by callers.
 *
 * The srcset comes from the reference's own widths, not from the current
 * width constant: this component renders snapshots taken months ago, and a
 * width added since then has no objects behind it for those images.
 */
export function MediaRef({ media, sizes, ...props }: MediaRefProps) {
  const widths = variantWidthsFor(media);
  const largest = widths[widths.length - 1]!;
  const srcSetFor = (format: string) =>
    widths
      .map((width) => `${resolveImageUrl(media.contentHash, width, format)} ${width}w`)
      .join(", ");

  return (
    <picture>
      <source type="image/avif" srcSet={srcSetFor("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSetFor("webp")} sizes={sizes} />
      <img
        src={resolveImageUrl(media.contentHash, largest, "jpeg")}
        srcSet={srcSetFor("jpeg")}
        sizes={sizes}
        alt={media.alt}
        width={media.width}
        height={media.height}
        {...props}
      />
    </picture>
  );
}
