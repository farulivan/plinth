# @plinth/api — Fly.io secrets

Secrets are set with `fly secrets set` (or `fly secrets import`), **never committed**.
`fly.toml`'s `[env]` holds only non-sensitive config; everything below is a secret.
This file is the checklist of what must exist before the app boots — `src/lib/env.ts`
parses `process.env` at startup and **fails fast** if any required var is missing.

| Secret                     | Required | Purpose                                                        |
| -------------------------- | -------- | ------------------------------------------------------------- |
| `DATABASE_URL`             | yes      | Neon Postgres pooler URL (append `?sslmode=require`)          |
| `BETTER_AUTH_SECRET`       | yes      | signs Better Auth sessions (`openssl rand -base64 32`)        |
| `BETTER_AUTH_URL`          | yes      | public origin of the auth handler (the dashboard URL)        |
| `INTERNAL_API_HMAC_SECRET` | yes      | shared HMAC secret for dashboard→api calls (ADR-0008)        |
| `SENTRY_DSN_API`           | no       | Sentry DSN for errors + perf; unset = telemetry disabled      |

`INTERNAL_API_HMAC_SECRET` **must match** the dashboard's value, or every
internal call is rejected with `401`.

## Set them

Run from the monorepo root:

```sh
fly secrets set \
  DATABASE_URL="postgres://…?sslmode=require" \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL="https://dashboard.example.com" \
  INTERNAL_API_HMAC_SECRET="$(openssl rand -base64 32)" \
  SENTRY_DSN_API="https://…@…ingest.sentry.io/…" \
  --config apps/api/fly.toml
```

Omit `SENTRY_DSN_API` to run without telemetry. Setting secrets triggers a rolling
restart so the new values are picked up.

## GitHub Actions secret: `DATABASE_URL`

Separate from the Fly secret above — `.github/workflows/deploy-api.yml`'s `migrate`
job runs `drizzle-kit migrate` from the GitHub Actions runner (not inside the
deployed container) before the deploy job starts, so it needs its own path to
the database. Same connection string as the Fly secret, set as a repository
secret scoped to the `production` environment (Settings → Environments →
production → Secrets):

```sh
gh secret set DATABASE_URL --env production --body "postgres://…?sslmode=require"
```
