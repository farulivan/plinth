import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { mediaVariantWidths, type MediaVariantFormat } from "@plinth/schema/api";
import sharp from "sharp";
import { env } from "../../lib/env";
import { s3 } from "../../lib/s3";

/**
 * External boundary of the media domain (ADR-0006, ADR-0009): Sharp
 * transforms and R2 object I/O. Never imports service or db. The magic-byte
 * sniff lives in ./sniff (pure, testable without this module's env).
 */

export interface ImageVariant {
  width: number;
  format: MediaVariantFormat;
  bytes: Buffer;
}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: ImageVariant[];
}

/**
 * Decode once, emit AVIF + WebP + JPEG at every width that exists for the
 * original (never upscaled — `mediaVariantWidths` is the shared rule the
 * renderer's srcset derives from). `.rotate()` bakes EXIF orientation in, so
 * stored dimensions match what the browser will lay out.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const oriented = sharp(input).rotate();
  const meta = await oriented.toBuffer({ resolveWithObject: true });
  const { width, height } = meta.info;

  const widths = mediaVariantWidths(width);
  const variants = await Promise.all(
    widths.flatMap((targetWidth) => [
      encode(meta.data, targetWidth, "avif"),
      encode(meta.data, targetWidth, "webp"),
      encode(meta.data, targetWidth, "jpeg"),
    ]),
  );
  return { width, height, variants };
}

async function encode(
  input: Buffer,
  width: number,
  format: MediaVariantFormat,
): Promise<ImageVariant> {
  const resized = sharp(input).resize({ width, withoutEnlargement: true });
  const encoded =
    format === "avif"
      ? resized.avif({ quality: 60 })
      : format === "webp"
        ? resized.webp({ quality: 78 })
        : resized.jpeg({ quality: 80, mozjpeg: true });
  return { width, format, bytes: await encoded.toBuffer() };
}

/** Variants land at `tenants/{ws}/{hash}/w{width}.{format}` (ADR-0006) —
 * content-addressed, immutable, so the cache header never lies. */
export async function uploadMediaVariants(
  workspaceId: string,
  contentHash: string,
  variants: ImageVariant[],
): Promise<void> {
  await Promise.all(
    variants.map((variant) =>
      s3.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_MEDIA,
          Key: `tenants/${workspaceId}/${contentHash}/w${variant.width}.${variant.format}`,
          Body: variant.bytes,
          ContentType: `image/${variant.format}`,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
    ),
  );
}

/** One variant object, for the dashboard's preview proxy. Null on miss. */
export async function getMediaObject(
  workspaceId: string,
  contentHash: string,
  variantFile: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  try {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_MEDIA,
        Key: `tenants/${workspaceId}/${contentHash}/${variantFile}`,
      }),
    );
    if (!object.Body) return null;
    return {
      body: object.Body.transformToWebStream(),
      contentType: object.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
}
