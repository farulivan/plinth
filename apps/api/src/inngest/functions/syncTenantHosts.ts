import { db } from "../../lib/db";
import { syncWorkspaceHost } from "../../modules/domains/service";
import { inngest } from "../client";

/**
 * KV convergence after a promote (ADR-0004): pushes the workspace's hostname
 * mapping to the edge so the worker-router serves the new version within
 * seconds. Separate from the build function so a Cloudflare outage retries
 * the sync alone — the promote already happened and must not re-run.
 */
export const syncTenantHosts = inngest.createFunction(
  { id: "sync-tenant-hosts", retries: 2 },
  { event: "site/version.promoted" },
  async ({ event }) => {
    const { workspaceId, versionNumber } = event.data;
    return syncWorkspaceHost(db, { workspaceId, versionNumber });
  },
);
