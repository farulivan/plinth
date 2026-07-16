import { EventSchemas, Inngest } from "inngest";
import { env } from "../lib/env";

/**
 * The Inngest client (ADR-0003): typed event catalogue + send/serve handle.
 * Local dev talks to the compose dev server (INNGEST_DEV=1, no keys);
 * production talks to Inngest Cloud with the event key, and the serve
 * endpoint authenticates via INNGEST_SIGNING_KEY, which the SDK reads from
 * process.env on its own.
 */

type Events = {
  /** Emitted after a content_versions snapshot is inserted; the build
   * function is its only consumer. */
  "site/publish.requested": {
    data: { workspaceId: string; versionId: string; versionNumber: number };
  };
  /** Emitted by the build function after the pointer swap; the KV-sync
   * function pushes the mapping to the edge (ADR-0004). */
  "site/version.promoted": {
    data: { workspaceId: string; versionId: string; versionNumber: number };
  };
};

export const inngest = new Inngest({
  id: "plinth-api",
  isDev: env.INNGEST_DEV === "1",
  eventKey: env.INNGEST_EVENT_KEY,
  schemas: new EventSchemas().fromRecord<Events>(),
});
