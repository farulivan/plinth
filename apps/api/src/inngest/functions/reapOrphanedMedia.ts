import { db } from "../../lib/db";
import { reapOrphanedMedia } from "../../modules/reapers/service";
import { inngest } from "../client";

/** Daily orphan sweep (ADR-0006): a media row unreferenced by any draft or
 * retained version, older than its 7-day grace window, is deleted along
 * with its R2 variants — the only place in the codebase that issues R2
 * DeleteObject for media. */
export const mediaReaper = inngest.createFunction(
  { id: "reap-orphaned-media", retries: 2 },
  { cron: "15 3 * * *" },
  async () => reapOrphanedMedia(db),
);
