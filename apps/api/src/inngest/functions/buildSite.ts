import { NonRetriableError } from "inngest";
import { db } from "../../lib/db";
import {
  buildAndUploadVersion,
  markVersionBuilding,
  markVersionFailed,
  promoteVersion,
  UnbuildableVersionError,
} from "../../modules/publish/service";
import { inngest } from "../client";

/**
 * The publish build job (ADR-0003): snapshot → astro build → R2 upload →
 * pointer swap. Tenant scoping comes from the event payload — every db touch
 * inside the service sets the workspace GUC before reading (ADR-0002).
 *
 * Steps are the retry units, and the boundaries are drawn where state can
 * actually cross them: anything that lives only on local disk stays inside a
 * single step, because a step's result is persisted as JSON and replayed into
 * a fresh invocation that may not be the same machine. So a flaky upload
 * re-runs its build as well — the wasted work is the price of never handing a
 * filesystem path to an invocation that cannot resolve it.
 *
 * Inngest retries the function 3× with backoff; when the last attempt dies,
 * onFailure marks the version failed so the dashboard can offer Retry.
 * Concurrency serializes per workspace — two publishes from one tenant queue
 * behind each other, cross-tenant builds run in parallel (ADR-0003).
 */
export const buildSite = inngest.createFunction(
  {
    id: "build-site",
    // ADR-0003: 3 attempts total (first run + 2 retries), exponential backoff.
    retries: 2,
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

    // One step, not two: a boundary here would hand a tmpdir path to a later
    // invocation that may not share that disk, and replay would keep re-feeding
    // the same dead path on every retry. See buildAndUploadVersion.
    const { files } = await step.run("build-and-upload", async () => {
      try {
        return await buildAndUploadVersion(db, { workspaceId, versionId, versionNumber });
      } catch (error) {
        if (error instanceof UnbuildableVersionError) {
          throw new NonRetriableError(error.message, { cause: error });
        }
        throw error;
      }
    });

    await step.run("promote", () => promoteVersion(db, workspaceId, versionId));

    // The edge learns about the new version from this event (ADR-0004,
    // trigger point deviating from its Postgres-trigger wording — the emit
    // lives here, next to the pointer swap it mirrors).
    await step.sendEvent("emit-promoted", {
      name: "site/version.promoted",
      data: { workspaceId, versionId, versionNumber },
    });

    return { versionId, versionNumber, files };
  },
);
