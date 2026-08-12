# Operations

Scheduled cleanup, backups, and the runbook for recovering from them going wrong. Deploy-specific steps (Fly.io, DNS, secrets) live in `docs/deployment.md`.

## Scheduled jobs

All five run as Inngest cron functions (`apps/api/src/inngest/functions/`), registered in `apps/api/src/inngest/index.ts`. Locally, watch them in the Inngest dev server UI (`http://localhost:8288`) — each has its own run history, retries, and a "Trigger" button that fires it on demand without waiting for the schedule.

| Job | Schedule (UTC) | What it does | Source |
|---|---|---|---|
| `reap-expired-sessions` | daily, 03:00 | Deletes `session` rows past `expires_at`. Not RLS-scoped — Better Auth sessions are keyed by user, not workspace. | `apps/api/src/modules/reapers/service.ts` → `reapExpiredSessions` |
| `reap-orphaned-media` | daily, 03:15 | Per workspace: deletes `media` rows unreferenced by any current draft or version snapshot, older than 7 days, plus their R2 variant objects and the retained original. | `reapOrphanedMedia` |
| `reap-old-versions` | daily, 03:30 | Per workspace: keeps the 10 most recent `content_versions` rows plus whichever one is currently live, deletes the rest plus their R2 site files. | `reapOldVersions` |
| `reencode-media-variants` | daily, 03:40 | Per workspace: encodes variant widths that were added after an image was uploaded, from its retained original, then records the wider set on the row. | `apps/api/src/modules/media/service.ts` → `reencodeMediaVariants` |
| `backup-database` | weekly, Sunday 04:00 | `pg_dump --format=custom` uploaded to `r2://plinth-backups/postgres/{iso_week}.dump`. | `backupDatabase` |

Times are staggered so the daily jobs don't contend for the same connection pool slot on a slow morning. The re-encoder runs last on purpose: it is the only one that writes rather than deletes, and running it after the media reaper means it never spends Sharp time on an image that is about to be swept.

### Why these are safe to re-run

Every reaper is idempotent by construction — re-running "delete what's already gone" is a no-op, not an error. None of them mutate anything that isn't already scheduled for deletion; a manual trigger from the Inngest dev UI is always safe to use for testing without waiting for the cron.

The re-encoder is idempotent for a different reason: it only ever adds widths an image does not have, so a second run finds nothing to do. It is capped at 25 images per run and carries `retries: 0` — a partial run is not a failure state, whatever it widened is durable, and the next night resumes from what is still missing.

### The re-encoder, and when it does anything

Nothing, on a healthy library — which is the normal state. It exists for the night after `MEDIA_VARIANT_WIDTHS` grows, when it converges every tenant without anyone remembering to trigger it.

Two things it does not do, both deliberate:

- **It skips images whose original was never retained**, permanently rather than as a retry. Originals began being kept only when the width set moved to six; anything uploaded before that has no bytes to decode from. Those rows keep the legacy `[400, 800, 1200, 1600]`, which is exactly what their references already claim, so nothing is broken — it just cannot improve. A rising `skipped` count is that population, not an error.
- **It widens objects, not references.** A `mediaRef` freezes its widths when the image is picked, so a page does not gain the wider set until the image is re-picked. When an author wants an old image widened on a live page, tell them to re-upload the file: that path encodes the missing widths *and* rewrites the reference, which the cron cannot do.

### Orphan detection, in one sentence

A media row counts as referenced if its id shows up anywhere inside the workspace's draft document or any version snapshot still on file — a regex scan over the serialized JSON for `"mediaId":"<uuid>"`, not a foreign key. This means the version reaper and the media reaper have an ordering dependency worth knowing: if a version is deleted before the media reaper runs, any media that version *uniquely* referenced becomes eligible for cleanup on the next media-reaper pass, not immediately. This is intentional — never delete media that's still live in either place.

## Backups and restore

### What exists

- **Neon PITR** (point-in-time recovery, 7-day window on the paid tier) — the primary story for "a migration or a bad query corrupted recent data."
- **Weekly `pg_dump`** to Cloudflare R2 (`plinth-backups` bucket, `postgres/{iso_week}.dump`) — the "what if Neon itself disappears" story. `{iso_week}` is `YYYY-Www` (e.g. `2026-W29`), computed in `apps/api/src/modules/reapers/service.ts`'s `isoWeek()`.

### Restoring from a weekly dump

1. Download the dump from R2:
   ```
   aws s3 cp s3://plinth-backups/postgres/2026-W29.dump ./postgres.dump \
     --endpoint-url <R2 account endpoint>
   ```
2. Provision a fresh Neon project (or a scratch Postgres instance for a rehearsal).
3. Restore:
   ```
   pg_restore --format=custom --clean --if-exists --no-owner \
     --dbname <new DATABASE_URL> ./postgres.dump
   ```
4. Point `DATABASE_URL` at the restored instance (Fly.io secrets for each app), redeploy.
5. Verify the cross-tenant RLS probe still passes against the restored database (`pnpm --filter @plinth/db test` includes it) before treating the restore as trustworthy.

### Restore rehearsal cadence

Run the above against a scratch project quarterly — a backup nobody has restored is a hope, not a plan. Track the exercise wherever the team tracks recurring operational tasks (a GitHub Issue with a 90-day reminder is enough at this scale).

### `pg_dump` version note

The api's Docker image installs `postgresql-client-17` (from the PGDG apt repo, not Debian's default v15 package) to match Neon's Postgres 17 — `pg_dump` refuses to dump from a server newer than itself, so this pin matters. If the database ever moves to a new Postgres major version, bump the client package in `apps/api/Dockerfile` alongside it.

**Testing the backup job via `pnpm dev`:** the api runs on the host in dev mode, so it shells out to whatever `pg_dump` is on *your* `PATH`, not the one baked into the Docker image. macOS's Homebrew `postgresql` formula tracks an older major version by default, which fails against the v17 dev Postgres with `server version mismatch`. Install a matching client — `brew install postgresql@17` — and put it on `PATH` before running `pnpm dev` (the formula prints the exact line for your shell profile). This only affects local testing of this one job; the deployed image is unaffected.
