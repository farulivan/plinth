import { db } from "../../lib/db";
import {
  buildVersion,
  markVersionBuilding,
  markVersionFailed,
  promoteVersion,
  uploadVersion,
} from "../../modules/publish/service";
import { inngest } from "../client";

/**
 * The publish build job (ADR-0003): snapshot → astro build → R2 upload →
 * pointer swap. Tenant scoping comes from the event payload — every db touch
 * inside the service sets the workspace GUC before reading (ADR-0002).
 *
 * Steps are the retry units: a flaky upload re-runs the upload, not the
 * build. Inngest retries the function 3× with backoff; when the last attempt
 * dies, onFailure marks the version failed so the dashboard can offer Retry.
 * Concurrency serializes per workspace — two publishes from one tenant queue
 * behind each other, cross-tenant builds run in parallel (ADR-0003).
 */
export const buildSite = inngest.createFunction(
  {
    id: "build-site",
    retries: 3,
    concurrency: { key: "event.data.workspaceId", limit: 1 },
    onFailure: async ({ event }) => {
      const { workspaceId, versionId } = event.data.event.data;
      await markVersionFailed(db, workspaceId, versionId);
    },
  },
  { event: "site/publish.requested" },
  async ({ event, step }) => {
    const { workspaceId, versionId, versionNumber } = event.data;

    await step.run("mark-building", () => markVersionBuilding(db, workspaceId, versionId));

    const { outDir } = await step.run("astro-build", () =>
      buildVersion(db, { workspaceId, versionId }),
    );

    const { files } = await step.run("upload-to-r2", () =>
      uploadVersion({ workspaceId, versionNumber, outDir }),
    );

    await step.run("promote", () => promoteVersion(db, workspaceId, versionId));

    return { versionId, versionNumber, files };
  },
);
