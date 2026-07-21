import { db } from "../../lib/db";
import { reapExpiredSessions } from "../../modules/reapers/service";
import { inngest } from "../client";

/** Daily session sweep (ADR-0005): a session past its sliding-expiry
 * deadline is dead weight, not a security risk (the auth middleware already
 * refuses it) — this just keeps the table from growing forever. */
export const sessionReaper = inngest.createFunction(
  { id: "reap-expired-sessions", retries: 2 },
  { cron: "0 3 * * *" },
  async () => reapExpiredSessions(db),
);
