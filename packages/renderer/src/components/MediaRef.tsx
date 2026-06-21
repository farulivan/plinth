import type { ImgHTMLAttributes } from "react";
import type { MediaRef as MediaRefValue } from "@plinth/schema/content";
import { resolveImageUrl } from "../resolveImageUrl";

type MediaRefProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  media: MediaRefValue;
};

/**
 * Renders a media reference as an <img>. Alt text lives on the field, not the
 * media row (ADR-0006), and is schema-required — so it is always present.
 * `src`/`alt` are derived here and cannot be overridden by callers.
 */
export function MediaRef({ media, ...props }: MediaRefProps) {
  return <img src={resolveImageUrl(media.mediaId)} alt={media.alt} {...props} />;
}
