import { err, ERROR_STATUS, ok } from "@plinth/schema/api";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../context";
import { RATE_LIMITS } from "../../lib/rateLimits";
import { rateLimit } from "../../middleware/rateLimit";
import { getMediaFile, listWorkspaceMedia, uploadMedia } from "./service";

/**
 * HTTP surface for the media domain (ADR-0006): list the library, accept a
 * multipart upload (whose body the HMAC envelope covers via the sha256
 * variant — see internalHmac), and stream one variant for the dashboard's
 * preview proxy. Routes delegate to service, never db/adapter (ADR-0009).
 */

const hashParam = z.string().regex(/^[0-9a-f]{64}$/);
const variantParam = z.string().regex(/^w\d{3,4}\.(avif|webp|jpeg)$/);

function requireWorkspace(c: Context<AppBindings>): string | null {
  return c.get("workspaceId");
}

export const mediaRoutes = new Hono<AppBindings>()
  .get("/", async (c) => {
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) {
      return c.json(err("unauthorized", "An active workspace is required."), {
        status: ERROR_STATUS.unauthorized,
      });
    }
    return c.json(ok(await listWorkspaceMedia(c.get("db"), workspaceId)));
  })
  .post(
    "/upload",
    rateLimit("upload", RATE_LIMITS.upload.limit, RATE_LIMITS.upload.windowSeconds),
    async (c) => {
      const workspaceId = requireWorkspace(c);
      const session = c.get("session");
      if (!workspaceId || !session) {
        return c.json(err("unauthorized", "An active workspace is required."), {
          status: ERROR_STATUS.unauthorized,
        });
      }

      // Raw bytes, not multipart (ADR-0014): the dashboard's forwarder already
      // unwrapped the file, and the HMAC middleware hashed these exact bytes.
      const bytes = Buffer.from(await c.req.arrayBuffer());
      if (bytes.byteLength === 0) {
        return c.json(err("validation_failed", "Expected the image bytes as the request body."), {
          status: ERROR_STATUS.validation_failed,
        });
      }

      const result = await uploadMedia(c.get("db"), {
        workspaceId,
        bytes,
        actorUserId: session.user.id,
      });
      switch (result.outcome) {
        // "refreshed" — a re-upload that widened an existing image's variants
        // — answers like a reuse: the caller's next move is identical, take
        // the item and write it into the field.
        case "created":
        case "reused":
        case "refreshed":
          return c.json(ok({ outcome: result.outcome, item: result.item }));
        case "unsupported-type":
          return c.json(
            err("validation_failed", "Only JPEG, PNG, WebP, or AVIF images are supported."),
            { status: ERROR_STATUS.validation_failed },
          );
        case "unreadable-image":
          return c.json(err("validation_failed", "That file could not be decoded as an image."), {
            status: ERROR_STATUS.validation_failed,
          });
        case "too-large":
          return c.json(err("payload_too_large", "Images are capped at 20 MB."), {
            status: ERROR_STATUS.payload_too_large,
          });
        case "storage-cap":
          return c.json(
            err(
              "payload_too_large",
              "This workspace's 5 GB media storage is full — remove unused images first.",
            ),
            { status: ERROR_STATUS.payload_too_large },
          );
      }
    },
  )
  .get("/file/:contentHash/:variant", async (c) => {
    const workspaceId = requireWorkspace(c);
    if (!workspaceId) {
      return c.json(err("unauthorized", "An active workspace is required."), {
        status: ERROR_STATUS.unauthorized,
      });
    }
    const contentHash = hashParam.safeParse(c.req.param("contentHash"));
    const variant = variantParam.safeParse(c.req.param("variant"));
    if (!contentHash.success || !variant.success) {
      return c.json(err("validation_failed", "Malformed media path."), {
        status: ERROR_STATUS.validation_failed,
      });
    }

    const file = await getMediaFile(workspaceId, contentHash.data, variant.data);
    if (!file) {
      return c.json(err("not_found", "No such media variant in the active workspace."), {
        status: ERROR_STATUS.not_found,
      });
    }
    return c.body(file.body, 200, {
      "content-type": file.contentType,
      // Content-addressed and authenticated: immutable, but only for this user.
      "cache-control": "private, max-age=31536000, immutable",
    });
  });
