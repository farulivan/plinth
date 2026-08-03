# Deployment

The go-live runbook: what to provision, in what order, and how the pieces connect. Day-2 operations (backups, reapers, restore) live in [operations.md](./operations.md).

## Topology

| Piece | Runs on | Notes |
| --- | --- | --- |
| Dashboard (`@plinth/dashboard`) | Fly.io app `plinth-farulivan-dashboard` | Next.js, auto-stops at idle |
| API (`@plinth/api`) | Fly.io app `plinth-farulivan-api` | Hono; owns uploads, SSE, Inngest, migrations |
| Worker router (`@plinth/worker-router`) | Cloudflare Worker | Host → KV → R2; serves published tenant sites |
| Database | Neon Postgres | pooled connection string, PITR on the paid tier |
| Rate limiting | Upstash Redis | REST endpoint |
| Background jobs | Inngest Cloud | build, KV sync, reapers, weekly backup |
| Object storage | Cloudflare R2 | three buckets: sites, media, backups |
| Errors + tracing | Sentry | one project per app |
| Transactional email | Resend | magic-link delivery |

Provision the backing services first (they produce the secrets the apps need at boot), then the edge, then the Fly apps last.

## Prerequisites

Accounts: Neon, Upstash, Inngest, Cloudflare (with `farulivan.com` on it), Sentry, Resend, Fly.io. CLIs: `flyctl`, `wrangler`, `gh`. A generated app secret uses `openssl rand -base64 32`.

## 1. Neon (database)

1. Create a project (Postgres 17 to match the backup client — see operations.md).
2. Copy the **pooled** connection string (the `-pooler` host, ADR-0011) and append `?sslmode=require`. This is `DATABASE_URL` for both apps and the migrate job.

## 2. Upstash (rate limiting)

Create a Redis database; copy the **REST** URL and token → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## 3. Inngest (background jobs)

Create an app; from its keys, copy the Event Key and Signing Key → `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Leave `INNGEST_DEV` unset in production. Point the Inngest app at the deployed api's `/api/inngest` endpoint.

## 4. Cloudflare (storage, edge, DNS)

**R2 buckets** — create three:

```sh
wrangler r2 bucket create plinth-sites
wrangler r2 bucket create plinth-media
wrangler r2 bucket create plinth-backups
```

Create an R2 API token (scoped to these buckets) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; the account's S3 endpoint → `R2_ENDPOINT_URL`. Bucket names → `R2_BUCKET_SITES`, `R2_BUCKET_MEDIA`, `R2_BUCKET_BACKUPS`.

**KV namespace** — the worker's Host → version map:

```sh
wrangler kv namespace create TENANT_HOSTS
```

Put the returned id into `apps/worker-router/wrangler.jsonc` (replacing the placeholder), and set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` as api secrets so the KV-sync job can write to it.

**Worker** — deploy and route it:

```sh
pnpm worker:deploy
```

The root script exists because `deploy` is a pnpm builtin: `pnpm --filter @plinth/worker-router deploy` never reaches wrangler, it asks pnpm to deploy the workspace package into a target directory and fails on the missing argument. `pnpm --filter @plinth/worker-router run deploy` also works — `run` is what disambiguates.

Bind the SITES/MEDIA R2 buckets and the TENANT_HOSTS KV in `wrangler.jsonc`, and add a route for `*.farulivan.com` so tenant hostnames hit the worker.

**DNS** on `farulivan.com`: a wildcard `*` record (tenant subdomains) and an explicit `norven` record, both proxied through Cloudflare. Point `plinth` (dashboard) and `api` at their Fly apps.

**Headers**: nothing to configure at the edge for the dashboard — HSTS and the other non-CSP headers ship from `apps/dashboard/next.config.ts` and the CSP from its proxy, per ADR-0011. Tenant sites get theirs from the worker-router. Verify after a deploy with `curl -sI https://plinth.farulivan.com/login`, which should carry `strict-transport-security`, `x-content-type-options`, `referrer-policy`, `permissions-policy`, both `cross-origin-*` headers, and a `content-security-policy` whose nonce matches the inline scripts in the body.

Set `TENANT_HOST_SUFFIX=.farulivan.com` on the api (it defaults to `.localhost`).

## 5. Sentry

Create two projects (api, dashboard). The api's DSN → `SENTRY_DSN_API` (api secret). The dashboard's DSN → `NEXT_PUBLIC_SENTRY_DSN_DASHBOARD` (a **build arg**, public, baked into the client bundle — see `apps/dashboard/secrets.md`). Optionally a `SENTRY_AUTH_TOKEN` for source-map upload.

## 6. Resend

Verify the sending domain, create an API key → `RESEND_API_KEY`, and set `EMAIL_FROM` (e.g. `Plinth <auth@farulivan.com>`). With both unset the apps fall back to printing magic links to stdout — fine for a smoke test, not for real users.

## 7. Fly.io (the apps)

Launch each app (from the repo root; the Dockerfiles need the whole workspace as build context):

```sh
fly launch --config apps/api/fly.toml --no-deploy
fly launch --config apps/dashboard/fly.toml --no-deploy
```

Set each app's secrets from its own checklist — `apps/api/secrets.md` and `apps/dashboard/secrets.md` — filling in the values collected above. `BETTER_AUTH_SECRET` and `INTERNAL_API_HMAC_SECRET` **must be identical across both apps**, or every internal call 401s.

## 8. GitHub Actions wiring

The deploy workflows run on push to `main` (`deploy-api.yml`, `deploy-dashboard.yml`). They authenticate with **least-privilege Fly deploy tokens**, not OIDC:

```sh
fly tokens create deploy -a plinth-farulivan-api        # → repo secret FLY_TOKEN_API
fly tokens create deploy -a plinth-farulivan-dashboard  # → repo secret FLY_TOKEN_DASHBOARD
```

The api deploy runs migrations from the runner before cutting traffic, so it needs its own database path:

```sh
gh secret set DATABASE_URL --env production --body "postgres://…?sslmode=require"
gh secret set FLY_TOKEN_API --body "…"
gh secret set FLY_TOKEN_DASHBOARD --body "…"
gh variable set NEXT_PUBLIC_SENTRY_DSN_DASHBOARD --body "https://…ingest.sentry.io/…"
```

## 9. First deploy + verification

Push to `main` (or run each deploy workflow manually once). Then verify:

1. `curl https://api.farulivan.com/health` and the dashboard's `/api/health` both return ok.
2. Sign in at `https://plinth.farulivan.com` via a real magic link (Resend delivers it).
3. Publish the Norven workspace from the dashboard; confirm the build succeeds and `https://norven.farulivan.com` serves the site with the ADR-0011 tenant headers.
4. Confirm an unmapped hostname returns 404 (fail-closed, ADR-0004).
5. The RLS probe still ship-blocks CI (`@plinth/db` test) — the guarantee that survives every deploy.

## Recovery

Backup, restore, and the reaper schedule are documented in [operations.md](./operations.md). The one-line summary: Neon PITR for recent data loss, the weekly R2 dump for provider-level loss, and a quarterly restore rehearsal that keeps both honest.
