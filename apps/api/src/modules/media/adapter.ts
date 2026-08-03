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
