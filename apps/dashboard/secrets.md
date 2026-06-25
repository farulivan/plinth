# @plinth/dashboard — Fly.io secrets & build args

Two kinds of config, set differently:

## Runtime secrets — `fly secrets set` (read at request time)

| Secret                     | Required | Purpose                                                  |
| -------------------------- | -------- | -------------------------------------------------------- |
| `DATABASE_URL`             | yes      | Neon Postgres pooler (the same instance the api uses)    |
| `BETTER_AUTH_SECRET`       | yes      | signs Better Auth sessions — **must match the api**      |
| `BETTER_AUTH_URL`          | yes      | this dashboard's public origin                           |
| `INTERNAL_API_URL`         | yes      | base URL of the api for RPC calls                        |
| `INTERNAL_API_HMAC_SECRET` | yes      | dashboard→api HMAC — **must match the api** (ADR-0008)   |
| `RESEND_API_KEY`           | no       | magic-link email; unset → dev stdout fallback            |
| `EMAIL_FROM`               | no       | magic-link from address                                  |
| `SENTRY_AUTH_TOKEN`        | no       | source-map upload during build; unset → upload skipped   |

```sh
fly secrets set \
  DATABASE_URL="postgres://…?sslmode=require" \
  BETTER_AUTH_SECRET="…" \
  BETTER_AUTH_URL="https://dashboard.example.com" \
  INTERNAL_API_URL="https://api.example.com" \
  INTERNAL_API_HMAC_SECRET="…" \
  --config apps/dashboard/fly.toml
```

## Build args — inlined at build, NOT runtime secrets

`NEXT_PUBLIC_*` values are baked into the client bundle by `next build`, so they
must be passed at **build** time, not as Fly secrets:

| Build arg                          | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN_DASHBOARD` | client Sentry DSN (public; write-only ingest) |

```sh
fly deploy --config apps/dashboard/fly.toml \
  --build-arg NEXT_PUBLIC_SENTRY_DSN_DASHBOARD="https://…ingest.sentry.io/…"
```
