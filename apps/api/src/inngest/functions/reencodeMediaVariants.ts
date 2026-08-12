import { db } from "../../lib/db";
import { reencodeMediaVariants } from "../../modules/media/service";
import { inngest } from "../client";

/**
 * Nightly variant backfill (ADR-0006): media whose retained original can
 * produce a width it does not yet have gets that width encoded and recorded.
 *
 * A no-op on a library that is already current, which is the steady state — it
 * earns its keep the night after MEDIA_VARIANT_WIDTHS grows, converging every
 * tenant without anyone remembering to trigger anything. Bounded per run, so
 * catching up is spread over nights rather than held inside one step.
 *
 * Deliberately not retried: a partial run is not a failure state. Whatever it
 * widened is durable, and the next night resumes from what is still missing.
 */
export const mediaReencoder = inngest.createFunction(
  { id: "reencode-media-variants", retries: 0 },
  { cron: "40 3 * * *" },
  async () => reencodeMediaVariants(db),
);
