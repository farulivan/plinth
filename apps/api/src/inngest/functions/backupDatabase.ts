import { backupDatabase } from "../../modules/reapers/service";
import { inngest } from "../client";

/** Weekly logical dump to R2 (ADR-0011): the "what if Neon disappears"
 * story, on top of Neon's own point-in-time recovery. */
export const databaseBackup = inngest.createFunction(
  { id: "backup-database", retries: 2 },
  { cron: "0 4 * * 0" },
  async () => backupDatabase(),
);
