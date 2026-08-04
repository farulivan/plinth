/**
 * Converge stored content documents on the current schema version.
 *
 * Nothing breaks without this: every read upgrades in memory (ADR-0015), so a
 * v1 row renders and publishes exactly like a v2 one. What it buys is that the
 * upgrade stops running on the hot read path, and that `contentHash` over a
 * draft stops depending on which side of the upgrade the caller looked at.
 *
 * Drafts only. `content_versions` snapshots are deliberately left alone — they
 * are immutable by contract, a rollback selects one and rebuilds nothing, and
 * rewriting them would change their content hash, breaking the idempotency key
 * that maps content to a version (docs/migrations.md).
 *
 * Idempotent: a row already at the current version is written back byte-
 * identical, so re-running is free.
 *
 *   pnpm migrate:documents            # report only
 *   pnpm migrate:documents --write    # apply
 */
/* eslint-disable turbo/no-undeclared-env-vars -- one-shot script, never a
 * cached turbo task; its env vars are not build inputs. */
import { createDb, withWorkspace } from "@plinth/db";
import { contentDrafts } from "@plinth/db/schema";
import { DOCUMENT_SCHEMA_VERSION, parseContentDocument } from "@plinth/schema";
import { eq } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://plinth:plinth@localhost:5433/plinth";
const write = process.argv.includes("--write");

async function main(): Promise<void> {
  const { db, pool } = createDb({ connectionString, max: 3 });
  let upgraded = 0;
  let alreadyCurrent = 0;
  let failed = 0;

  try {
    // Not RLS-scoped: this reads across every tenant, so it runs as the
    // migration actor rather than inside a workspace transaction. The write
    // below rebinds the GUC per row.
    const rows = await db
      .select({ workspaceId: contentDrafts.workspaceId, document: contentDrafts.document })
      .from(contentDrafts);

    for (const row of rows) {
      const version =
        typeof row.document === "object" && row.document && "schemaVersion" in row.document
          ? row.document.schemaVersion
          : 1;
      if (version === DOCUMENT_SCHEMA_VERSION) {
        alreadyCurrent += 1;
        continue;
      }

      let document;
      try {
        document = parseContentDocument(row.document);
      } catch (error) {
        // Report and continue: one unparseable row should not stop the rest
        // converging, and it needs a human either way.
        failed += 1;
        console.error(`[migrate:documents] ${row.workspaceId} failed to parse:`, error);
        continue;
      }

      if (write) {
        await withWorkspace(db, row.workspaceId, (tx) =>
          tx
            .update(contentDrafts)
            .set({ document })
            .where(eq(contentDrafts.workspaceId, row.workspaceId)),
        );
      }
      upgraded += 1;
      console.log(`[migrate:documents] ${row.workspaceId}: v${String(version)} → v2`);
    }

    console.log(
      `[migrate:documents] ${write ? "wrote" : "would write"} ${String(upgraded)}, ` +
        `${String(alreadyCurrent)} already current, ${String(failed)} failed`,
    );
    if (!write && upgraded > 0) console.log("[migrate:documents] re-run with --write to apply");
    if (failed > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[migrate:documents] failed:", err);
  process.exitCode = 1;
});
