import { db } from "../../lib/db";
import { reapOldVersions } from "../../modules/reapers/service";
import { inngest } from "../client";

/** Daily retention sweep (ADR-0003): keeps the 10 most recent versions per
 * workspace plus whichever one is currently live, deleting the rest along
 * with their R2 site artifacts. */
export const versionReaper = inngest.createFunction(
  { id: "reap-old-versions", retries: 2 },
  { cron: "30 3 * * *" },
  async () => reapOldVersions(db),
);
