import { zValidator } from "@hono/zod-validator";
import { err, ERROR_STATUS, ok } from "@plinth/schema/api";
import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../context";
import { RATE_LIMITS } from "../../lib/rateLimits";
import { rateLimit } from "../../middleware/rateLimit";
import {
  getPublishStatus,
  getVersionHistory,
  requestPublish,
  retryPublish,
  rollbackToVersion,
} from "./service";

/**
 * HTTP surface for the publish domain (ADR-0003): trigger a publish, poll
 * status, retry a failed build. Speaks Hono and the shared envelope,
 * delegates to service (ADR-0009). requireSession runs upstream; the
 * workspace check is explicit because a session may predate workspace
 * activation.
 */

const retryBody = z.object({ versionId: z.uuid() });
const rollbackBody = z.object({ versionId: z.uuid() });

export const publishRoutes = new Hono<AppBindings>()
  .post(
    "/",
    rateLimit("publish", RATE_LIMITS.publish.limit, RATE_LIMITS.publish.windowSeconds),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const session = c.get("session");
      if (!workspaceId || !session) {
        return c.json(err("unauthorized", "An active workspace is required."), {
          status: ERROR_STATUS.unauthorized,
        });
      }

      const result = await requestPublish(c.get("db"), { workspaceId, userId: session.user.id });
      switch (result.outcome) {
        case "created":
        case "reused":
          return c.json(ok({ outcome: result.outcome, version: result.version }));
        case "no-draft":
          return c.json(err("not_found", "Nothing to publish — this workspace has no draft yet."), {
            status: ERROR_STATUS.not_found,
          });
        case "unknown-template":
          return c.json(
            err("internal", `Template "${result.templateId}" is not registered on the api.`),
            { status: ERROR_STATUS.internal },
          );
        case "invalid-draft": {
          // Name the offenders in the message itself — the bar shows one line,
          // and "something is invalid" without a pointer is undebuggable.
          //
          // A key alone was not enough of a pointer. A migrated workspace
          // fails on `site`, whose reason — its name and description were
          // seeded blank by the v1 upgrade rather than invented (ADR-0015) —
          // was sitting unread in `fieldErrors`. "fix in the editor: site" is
          // a field path, not something an author can act on, so the reason
          // now travels with it.
          const entries = Object.entries(result.fieldErrors);
          const detail = entries
            .slice(0, 3)
            .map(([field, messages]) => (messages[0] ? `${field} — ${messages[0]}` : field))
            .join("; ");
          const rest = entries.length > 3 ? ` (+${String(entries.length - 3)} more)` : "";
          return c.json(
            err(
              "validation_failed",
              `Not ready to publish. ${detail}${rest} (A section you can't finish yet can be toggled off.)`,
              result.fieldErrors,
            ),
            { status: ERROR_STATUS.validation_failed },
          );
        }
      }
    },
  )
  .get("/status", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!workspaceId) {
      return c.json(err("unauthorized", "An active workspace is required."), {
        status: ERROR_STATUS.unauthorized,
      });
    }
    return c.json(ok(await getPublishStatus(c.get("db"), workspaceId)));
  })
  .get("/versions", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!workspaceId) {
      return c.json(err("unauthorized", "An active workspace is required."), {
        status: ERROR_STATUS.unauthorized,
      });
    }
    return c.json(ok(await getVersionHistory(c.get("db"), workspaceId)));
  })
  .post(
    "/rollback",
    zValidator("json", rollbackBody, (result, c) => {
      if (!result.success) {
        return c.json(err("validation_failed", "Expected { versionId }."), {
          status: ERROR_STATUS.validation_failed,
        });
      }
    }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const session = c.get("session");
      if (!workspaceId || !session) {
        return c.json(err("unauthorized", "An active workspace is required."), {
          status: ERROR_STATUS.unauthorized,
        });
      }

      const result = await rollbackToVersion(c.get("db"), {
        workspaceId,
        versionId: c.req.valid("json").versionId,
        userId: session.user.id,
      });
      switch (result.outcome) {
        case "rolled-back":
          return c.json(ok({ version: result.version }));
        case "not-found":
          return c.json(err("not_found", "No such version in the active workspace."), {
            status: ERROR_STATUS.not_found,
          });
        case "not-built":
          return c.json(
            err("conflict", `Only built versions can go live — this one is ${result.status}.`),
            { status: ERROR_STATUS.conflict },
          );
      }
    },
  )
  .post(
    "/retry",
    zValidator("json", retryBody, (result, c) => {
      if (!result.success) {
        return c.json(err("validation_failed", "Expected { versionId }."), {
          status: ERROR_STATUS.validation_failed,
        });
      }
    }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      if (!workspaceId) {
        return c.json(err("unauthorized", "An active workspace is required."), {
          status: ERROR_STATUS.unauthorized,
        });
      }

      const result = await retryPublish(c.get("db"), {
        workspaceId,
        versionId: c.req.valid("json").versionId,
      });
      switch (result.outcome) {
        case "requeued":
          return c.json(ok({ version: result.version }));
        case "not-found":
          return c.json(err("not_found", "No such version in the active workspace."), {
            status: ERROR_STATUS.not_found,
          });
        case "not-failed":
          return c.json(
            err("conflict", `Only failed builds can be retried — this one is ${result.status}.`),
            { status: ERROR_STATUS.conflict },
          );
      }
    },
  );
