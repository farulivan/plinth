import { Inngest, eventType, staticSchema } from "inngest";
import { env } from "../lib/env";

/**
 * The Inngest client (ADR-0003): typed events + send/serve handle.
 * Local dev talks to the compose dev server (INNGEST_DEV=1, no keys);
 * production talks to Inngest Cloud with the event key, and the serve
 * endpoint authenticates via INNGEST_SIGNING_KEY, which the SDK reads from
 * process.env on its own.
 *
 * v4 retired the client's central schema catalogue: an event is declared once
 * here and imported wherever it is sent or triggers a function, so the payload
 * type travels with the name rather than with the client.
 */

/** Both events answer the same question: which version of which workspace. */
type VersionEvent = { workspaceId: string; versionId: string; versionNumber: number };

/** Emitted after a content_versions snapshot is inserted; the build
 * function is its only consumer. */
export const publishRequested = eventType("site/publish.requested", {
  schema: staticSchema<VersionEvent>(),
});

/** Emitted by the build function after the pointer swap; the KV-sync
 * function pushes the mapping to the edge (ADR-0004). */
export const versionPromoted = eventType("site/version.promoted", {
  schema: staticSchema<VersionEvent>(),
});

export const inngest = new Inngest({
  id: "plinth-api",
  isDev: env.INNGEST_DEV === "1",
  eventKey: env.INNGEST_EVENT_KEY,
});
