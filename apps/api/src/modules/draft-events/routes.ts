import { zValidator } from "@hono/zod-validator";
import { err, ERROR_STATUS, ok } from "@plinth/schema/api";
import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AppBindings } from "../../context";
import { draftEventHub } from "./hub";
import { checkDraftAccess, type DraftAccess } from "./service";

/**
 * Preview event surface (ADR-0007, ADR-0012). POST /:draftId publishes a
 * draft-updated event after the dashboard's save action persists; GET
 * /:draftId is the SSE stream the dashboard proxies to the preview iframe.
 * Both run behind the usual chain (internalHmac → session → requireSession);
 * tenant scoping is the service's RLS visibility probe — a draft outside the
 * caller's active workspace matches zero rows and 404s, same as the editor.
 */

/** Keeps idle streams alive through Fly's edge proxy and anything else that
 * reaps quiet connections. */
const HEARTBEAT_MS = 25_000;

const notifyBody = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) });

function accessFailure(c: Context<AppBindings>, access: Exclude<DraftAccess, "ok">) {
  return access === "no-workspace"
    ? c.json(err("unauthorized", "An active workspace is required."), {
        status: ERROR_STATUS.unauthorized,
      })
    : c.json(err("not_found", "No such draft in the active workspace."), {
        status: ERROR_STATUS.not_found,
      });
}

export const draftEventsRoutes = new Hono<AppBindings>()
  .post(
    "/:draftId",
    // The validator (not a manual parse) so the dashboard's typed client
    // infers the json body shape; the hook keeps failures in the envelope.
    zValidator("json", notifyBody, (result, c) => {
      if (!result.success) {
        return c.json(err("validation_failed", "Expected { hash } as a sha256 hex digest."), {
          status: ERROR_STATUS.validation_failed,
        });
      }
    }),
    async (c) => {
      const draftId = z.uuid().safeParse(c.req.param("draftId"));
      if (!draftId.success) {
        return c.json(err("validation_failed", "Malformed draft id."), {
          status: ERROR_STATUS.validation_failed,
        });
      }

      const access = await checkDraftAccess(c.get("db"), c.get("workspaceId"), draftId.data);
      if (access !== "ok") return accessFailure(c, access);

      const event = draftEventHub.publish(draftId.data, c.req.valid("json").hash);
      return c.json(ok({ eventId: event.id }));
    },
  )
  .get("/:draftId", async (c) => {
    const draftId = z.uuid().safeParse(c.req.param("draftId"));
    if (!draftId.success) {
      return c.json(err("validation_failed", "Malformed draft id."), {
        status: ERROR_STATUS.validation_failed,
      });
    }

    const access = await checkDraftAccess(c.get("db"), c.get("workspaceId"), draftId.data);
    if (access !== "ok") return accessFailure(c, access);

    // A reconnecting client says where it got to. A first connection says
    // nothing and gets caught up to now — the latest buffered event only,
    // never the history.
    //
    // Catching up at all matters because the preview renders on the server,
    // capturing the draft's hash, and only then does the browser open this
    // stream. A save landing in that window is published to nobody, so the
    // page keeps its pre-save hash and sits on stale content until someone
    // reloads by hand. That window is tens of milliseconds on a fast machine
    // and over a second on CI.
    //
    // Catching up to the LATEST rather than replaying everything is the part
    // that has to be right. The client's only reaction is "this hash differs
    // from what I rendered, reload", so an older event hands it a stale hash,
    // it reloads, the reload replays the same history, and the preview blinks
    // forever. The newest event describes the current state, so it either
    // matches what was rendered and costs one ignored message, or it is the
    // save that was missed and costs exactly one reload.
    const lastEventId = c.req.header("last-event-id");
    const afterId =
      lastEventId && /^\d+$/.test(lastEventId)
        ? Number(lastEventId)
        : Math.max((draftEventHub.latestEventId(draftId.data) ?? 1) - 1, 0);

    return streamSSE(c, async (stream) => {
      const unsubscribe = draftEventHub.subscribe(
        draftId.data,
        (event) => {
          void stream.writeSSE({
            id: String(event.id),
            event: "draft-updated",
            data: JSON.stringify({
              type: "draft-updated",
              draftId: event.draftId,
              hash: event.hash,
            }),
          });
        },
        afterId,
      );
      stream.onAbort(unsubscribe);
      try {
        while (!stream.aborted) {
          await stream.sleep(HEARTBEAT_MS);
          if (stream.aborted) break;
          await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        }
      } finally {
        unsubscribe();
      }
    });
  });
