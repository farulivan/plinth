import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../../lib/env";
import { s3 } from "../../lib/s3";
import { type ImageVariant } from "./encode";

/**
 * External boundary of the media domain (ADR-0006, ADR-0009): R2 object I/O.
 * Never imports service or db. Two pure neighbours sit outside it so they run
 * without this module's env: the magic-byte sniff in ./sniff and the Sharp
 * encoding in ./encode. Both are re-exported here so callers keep one import
 * site for the media boundary.
 */

export { processImage, type ImageVariant, type ProcessedImage } from "./encode";

/** Extension for the retained original, from the sniffed type — the sniff is
 * the only trustworthy source, so this map is deliberately closed to exactly
 * what `sniffImageType` can return. */
const ORIGINAL_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function originalKey(workspaceId: string, contentHash: string, contentType: string): string {
  const extension = ORIGINAL_EXTENSIONS[contentType] ?? "bin";
  return `tenants/${workspaceId}/${contentHash}/original.${extension}`;
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

/**
 * Keep the uploaded bytes alongside the variants, at
 * `tenants/{ws}/{hash}/original.{ext}`.
 *
 * A width added later can only be produced by decoding the original — you
 * cannot make a w1920 out of a w1600 without upscaling — so without this the
 * variant set is frozen at whatever it was on the day of upload, and the only
 * remedy is asking the author to find the file again. That is the state every
 * image uploaded before this function existed is permanently in.
 *
 * It is never served. Both public paths validate the filename against
 * `w{digits}.{format}` (the worker's MEDIA_PATH and the api's variantParam),
 * which matters more here than it did for variants: the original still carries
 * the camera's EXIF, GPS included, while Sharp's re-encode drops it.
 */
export async function uploadMediaOriginal(
  workspaceId: string,
  contentHash: string,
  contentType: string,
  bytes: Buffer,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_MEDIA,
      Key: originalKey(workspaceId, contentHash, contentType),
      Body: bytes,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
}

/** The retained original, for re-encoding at a width that did not exist when
 * the image was uploaded. Null when the upload predates retention — the
 * caller's signal to leave that row alone rather than fail the run. */
export async function getMediaOriginal(
  workspaceId: string,
  contentHash: string,
  contentType: string,
): Promise<Buffer | null> {
  try {
    const object = await s3.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_MEDIA,
        Key: originalKey(workspaceId, contentHash, contentType),
      }),
    );
    if (!object.Body) return null;
    return Buffer.from(await object.Body.transformToByteArray());
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchKey") return null;
    throw error;
  }
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
