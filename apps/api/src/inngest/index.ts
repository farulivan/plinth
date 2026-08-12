import { databaseBackup } from "./functions/backupDatabase";
import { buildSite } from "./functions/buildSite";
import { sessionReaper } from "./functions/reapExpiredSessions";
import { versionReaper } from "./functions/reapOldVersions";
import { mediaReaper } from "./functions/reapOrphanedMedia";
import { mediaReencoder } from "./functions/reencodeMediaVariants";
import { syncTenantHosts } from "./functions/syncTenantHosts";
import { inngest } from "./client";

/** Everything server.ts needs to mount the Inngest endpoint. */
export { inngest };
export const functions = [
  buildSite,
  syncTenantHosts,
  sessionReaper,
  mediaReaper,
  mediaReencoder,
  versionReaper,
  databaseBackup,
];
