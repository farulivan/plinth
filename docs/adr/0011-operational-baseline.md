# Operational baseline: forward-only migrations, Neon pooler, PITR + weekly R2 dump, default-deny CSP

This ADR bundles four operational decisions that the earlier ADRs reference but do not define on their own: how schema migrations land, how Postgres connections are pooled, how the database is backed up and recovered, and what Content Security Policy ships with the dashboard and the per-tenant published sites. None of these is large enough to deserve its own ADR, but each is load-bearing enough that an unwritten convention is the wrong place for it — operational drift between what the ADRs assume and what the system actually does is the failure mode this document closes. The four decisions also share a posture: pick the boring, hosted-default answer that the rest of the architecture already implies, document why, and reserve the option to upgrade if the portfolio outgrows the free tiers.

## Migrations: Drizzle, forward-only, applied at deploy time

Schema changes ship as Drizzle migration files (`packages/db/src/migrations/*.sql`) generated via `drizzle-kit generate`. The deploy pipeline runs `drizzle-kit migrate` on the target database before the new container takes traffic, in lockstep with the application image. Migrations are forward-only: a problematic migration ships a follow-up migration that corrects it, never a rollback file. The convention exists because rollback files give the false comfort of reversibility while doing nothing about the data already shaped by the forward migration — by the time a regression surfaces in production, the schema is downstream of writes the rollback cannot undo without a restore.

- **Drizzle migrations applied pre-traffic at deploy** (chosen) — one migration tool, one source of truth (`packages/db/src/schema/*`), CI-verified diff between the schema files and the latest applied migration, automatic ordering by timestamp.
- **Manual SQL applied via psql** — rejected. No diff verification, no ordering guarantee, every contributor has to remember the convention; the failure mode is silent drift between environments.
- **Rollback migration files** — rejected. False reversibility. The honest answer to "this migration broke things" is "ship a forward migration that fixes the data and the shape" — or in the worst case "restore from PITR" (see backups below).
- **Long-running migrations as deploy gates** — rejected as default. A migration that takes minutes blocks the deploy; we keep migrations small and reversible-in-spirit via two-phase patterns (add column nullable → backfill → enforce NOT NULL in next deploy). The few cases that need a long backfill run as Inngest jobs, decoupled from deploy.

## Connection pooling: Neon's built-in pooler in transaction mode

Each app instantiates one Postgres pool sized for its own concurrency profile and connects through Neon's transaction-mode pooler endpoint (the `-pooler` hostname). Per-machine cap is 10 connections; the pooler multiplexes those onto the database's actual connection slots. We do not run PgBouncer ourselves.

- **Neon's hosted transaction pooler** (chosen) — operated by the database provider, no extra container to deploy, zero cost on top of the database bill, compatible with Drizzle's prepared statements when the right driver mode is selected.
- **Self-hosted PgBouncer on Fly.io** — rejected for portfolio scale. Adds one more machine to operate, one more deploy lane, and one more failure mode to monitor; the cost saving is zero because Neon's pooler is included; the throughput win only matters above the connection counts a portfolio workload reaches. Reserved as an upgrade path if a hosted pooler ever becomes the bottleneck.
- **No pooler, direct connections** — rejected. Postgres' max-connections cap is a hard ceiling; without a pooler, two Fly.io machines per app multiplied by autoscaling can exhaust slots during a redeploy. The cost of running without a pooler is one bad day.
- **Session-mode pooling** — rejected as default. Session mode pins a connection per client and gives up the multiplexing win; transaction mode is the right default for our workload (short transactions, no `LISTEN/NOTIFY` dependence, no session-local state besides the `workspace_id` GUC which `SET LOCAL` makes transaction-scoped).

## Backups and disaster recovery: Neon PITR plus weekly logical dump to R2

Neon's point-in-time recovery (7-day window on the paid tier) is the primary recovery story for accidental data loss within the last week. On top of that, an Inngest cron job runs `pg_dump --format=custom` once a week and uploads the resulting archive to a separate Cloudflare R2 bucket (`r2://plinth-backups/postgres/{iso_week}.dump`). The weekly dump is the "what if Neon disappears" story; PITR is the "what if a migration ran badly at 2 AM" story.

- **Neon PITR + weekly R2 dump** (chosen) — covers the two failure classes (logical error within the PITR window, provider-level loss outside it) with one paid-tier dependency we already have and one Inngest job we already have. RPO is ≤1 hour for the PITR window (Neon's WAL granularity) and ≤7 days for the R2 dump. RTO is ≤4 hours: restore the dump into a fresh Neon project, point the apps' `DATABASE_URL` at the new instance via Fly.io secrets, redeploy.
- **Manual `pg_dump` on a schedule** — rejected. Same shape as the chosen option but operated by a cron my laptop has to be awake for. Inngest makes "run this weekly, retry if it fails, alert if it fails twice" a five-line function; reinventing it is misuse of time.
- **Continuous WAL streaming to S3 (wal-g, pgbackrest)** — rejected for portfolio scale. The tooling assumes self-hosted Postgres; Neon already does WAL streaming internally as part of PITR. Layering another WAL streamer on top is operational duplication for no extra coverage.
- **Daily dumps instead of weekly** — rejected as default. The PITR window covers the daily-granularity case for free; the weekly dump is specifically for the "Neon went away" failure, and daily uploads would multiply R2 storage cost without lowering RPO in the only scenario the dump covers.
- **Test the restore quarterly** — accepted as the operational gate that makes the above credible. The runbook (`docs/operations.md` when it lands) documents a "restore the latest dump into a fresh Neon project and verify the cross-tenant RLS probe still passes against it" exercise, scheduled in Linear/GitHub Issues with a 90-day cadence.

## Content Security Policy: default-deny on the dashboard, permissive baseline on tenant sites

The dashboard ships with a strict, hash-and-nonce CSP because every script and style on it is first-party; the per-tenant published sites ship with a permissive baseline because tenants may include their own analytics snippets or inline scripts via constrained schema fields. The two surfaces have different threat models and different content provenance, so they get different policies — but both default to denying network targets we have not opted into.

Dashboard policy (sent as response headers from Next.js middleware):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.cloudflareimages.com;
  connect-src 'self' https://*.sentry.io;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

Tenant site policy (sent by the Cloudflare Worker that fronts the per-tenant R2 bucket):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.r2.cloudflarestorage.com;
  connect-src 'self';
  frame-ancestors 'self';
```

- **Default-deny dashboard, permissive tenant baseline** (chosen) — matches the asymmetric threat model. The dashboard handles credentials, tenant content, and audit data, so any cross-origin script is a kill chain; the tenant sites are public marketing surfaces where the renderer is the only source of script and tenants legitimately want inline styles for fine-grained design control.
- **Single policy for both surfaces** — rejected. Either the policy is loose enough for tenant marketing sites (which compromises the dashboard) or strict enough for the dashboard (which forbids the inline styles templates need to ship designed pages). One policy fits neither use cleanly.
- **CSP via meta tag rather than HTTP header** — rejected. Meta-tag CSP cannot set `frame-ancestors` or `report-uri`, and headers can be enforced at the edge before the response body reaches the browser. Headers are the correct delivery channel; meta tags are for environments where headers are not editable, which Plinth's deploy targets are not.
- **CSP report-only initially** — rejected as default. Report-only ships a policy that does nothing if the browser violates it — the wrong shape for a brand-new policy that has not been tested against real templates yet. We ship enforcement with a narrow allowlist, then expand the allowlist as templates add legitimate dependencies. The narrowness of the initial policy is the audit signal; loosening it requires a PR and ADR-grade reasoning.
- **Tighter tenant-side CSP per template** — accepted as a future direction. Once the first three templates ship, the union of their inline-style needs forms a clearer picture and the tenant policy can narrow on a per-template basis (set via the template manifest, applied at the Cloudflare Worker). For now, the permissive baseline is the floor.

**Amendment:** in development only, `script-src` adds `'unsafe-eval'` — Turbopack/React use `eval()` for HMR and dev-mode stack reconstruction, never in production. Gated on `NODE_ENV === "development"` in `apps/dashboard/proxy.ts`, so the built/prod policy never carries it.

**Amendment:** the dashboard's `frame-ancestors` ships as `'self'`, not the `'none'` drafted above. `/preview/[draftId]` (ADR-0007) is framed by the editor itself — same origin, session-scoped — so `'none'` would block the dashboard from embedding its own preview. `'self'` still refuses every other embedder, which is the property this directive exists for. Implemented in `apps/dashboard/proxy.ts`, with the nonce generated per request and forwarded to Server Components via an `x-nonce` request header (`packages/auth/src/middleware/next.ts`'s `createAuthGate` takes an optional header-forwarding hook so the redirect logic and the nonce plumbing don't duplicate each other).

**Amendment:** the non-CSP headers — HSTS, `Permissions-Policy`, COOP, CORP, plus `X-Content-Type-Options` and `Referrer-Policy` — ship from the app (`apps/dashboard/next.config.ts`), not as the Cloudflare Transform Rules this ADR originally delegated them to. The rules were never created for the dashboard host, and the delegation is what made that invisible: an edge rule cannot be reviewed in a diff, cannot be asserted in CI, and is silently absent from every environment that talks to the origin directly (`pnpm dev`, `pnpm local-prod`, the Playwright run). Emitting them from `next.config` gives one definition for every environment and puts the policy in the repository where it is reviewable. `next.config` rather than `proxy.ts` because these apply to every response, including the static assets and API routes the proxy's matcher skips; the CSP stays in the proxy because it needs the per-request nonce. HSTS ships without `preload` — that is a submission to a browser-shipped list and slow to reverse, so it stays an explicit operator decision.

**Amendment:** every route the proxy matches is rendered per request. The nonce above is generated per request, so a prerendered document — built once at compile time, before any request exists — cannot carry one, and its inline bootstrap scripts ship bare against a policy with no `'unsafe-inline'` to fall back on. That is invisible on a page which does not need to hydrate and fatal on one which does: the sign-in route is entirely client-side. `/login` and the 404 therefore set `dynamic = "force-dynamic"` (the sign-in form moved into `apps/dashboard/components/auth/login-form.tsx` so the route itself can be a Server Component that sets it). The rule this leaves behind: a new route under the matcher either renders dynamically or ships no scripts. `/icon.svg` is the only prerendered route and qualifies on the second count.

**Amendment:** the unauthenticated auth pages are inside the proxy's matcher. They were previously excluded to avoid a redirect loop against `protectedPaths: ["/"]`, which also excluded them from the CSP and left the sign-in page serving no policy at all. The loop is now handled by `publicPaths` on `createAuthGate` — a gate concern rather than a matcher one, so path policy and header policy stop being decided by the same regex.

**Amendment:** `script-src` no longer allowlists `https://browser.sentry-cdn.com`. Sentry ships through `@sentry/nextjs` and is bundled at build time, so the loader CDN was never fetched — the host appeared in no source file and no built chunk, only in this policy. A host allowlist is the one weakness a nonce-based `script-src` otherwise does not have, and Lighthouse's `csp-xss` audit flags it as high severity, so an entry nothing loads is pure attack surface. Adding a lazily loaded Sentry extra (Replay, the feedback widget) would need it back.

**Amendment:** the dashboard sets Zod's `jitless` on the client (`apps/dashboard/instrumentation-client.ts`). Zod 4 compiles validators with `new Function`, which this policy blocks; Zod catches the failure and falls back to the interpreted path, so validation was correct but every page load raised a CSP `kEvalViolation` and then took the slow path anyway. `jitless` skips the attempt. Client-only — the api validates far more per request and runs under no CSP.

**Amendment:** Lighthouse's `bf-cache` audit is asserted as a warning rather than an error. The audited route is the sign-in page, which is rendered per request and therefore `Cache-Control: no-store`, and `no-store` disqualifies a page from the back/forward cache by definition. That is the correct posture for a credential-entry page, so the audit is recording a deliberate trade rather than a defect; it stays visible as a warning instead of being switched off.

**Amendment:** ADR-0003's 20-publishes/day and ADR-0006's 100-uploads/hour caps are implemented as a fixed-window counter against the Upstash Redis REST endpoint already provisioned for local dev (SRH proxy) and production. `apps/api/src/middleware/rateLimit.ts` mounts per-route (`POST /publish`, `POST /media/upload` only — reads are uncapped), returns `429` with `Retry-After` via the existing `rate_limited` error code.

**Amendment:** the tenant policy gains `font-src 'self' data:`. "Permissive baseline" was drafted as a statement about `script-src` and `style-src`, but the policy as written also had no `font-src`, so font faces fell through to `default-src 'self'` — which excludes `data:`. Astro's CSS bundler base64-inlines small font subsets rather than emitting a file for each, so the built stylesheet contains a `url(data:font/woff2;…)` the browser then refuses to load. Verified in a real build rather than inferred: one JetBrains Mono subset ships inlined today. The directive is now explicit, and the scheduled header check asserts it, because the failure mode is a font that silently does not render rather than anything that errors.

**Amendment:** the tenant policy also gains `form-action 'self'`, `base-uri 'self'`, `object-src 'none'`, `frame-src 'none'` and `upgrade-insecure-requests`, and `frame-ancestors` tightens from `'self'` to `'none'`. The dashboard's `'self'` exists because the editor frames its own preview route; no such case exists for a published tenant site, which nothing embeds. Alongside the policy, tenant responses now carry `X-Frame-Options: DENY`, a `Permissions-Policy` denying nineteen features, and COOP/CORP at `same-origin` — the set the first tenant's standalone site already ships, so this is parity rather than a new posture. `Strict-Transport-Security` is deliberately not among them: it is a zone-level Cloudflare setting covering every host, and emitting it from the worker as well would send it twice.

**Amendment:** tenant cache-control keys off the request path, not the content type. The original rule cached everything that was not `text/html` for a year as immutable, which is only true of URLs carrying a digest — Astro's `/_astro/` bundles and content-addressed `/_media/` variants. Everything else a build emits lives at a stable path whose bytes change on the next publish: `sitemap.xml`, `robots.txt`, `favicon.ico`, a web manifest. Under the old rule each of those would have been frozen at the edge for a year with no way to flush, and only after the first publish that changed one. Latent when written — the only such files were two never-changing favicons — and load-bearing as soon as generated files land.

**Amendment:** a miss inside a mapped site serves that site's own `404.html` when the build produced one, instead of the platform's plain-text response. Fail-closed is unchanged: the fallback is still the generic 404, the lookup is scoped to the requesting hostname's workspace and version, and an unmapped hostname never reaches for a tenant page at all.

## Consequences

- **Schema, pooling, backups, and CSP each have one chosen tool and one stated reason.** No room for "we should probably also add X" outside this document; adding a sidecar (PgBouncer, wal-g, helmet for CSP, etc.) requires updating this ADR with a rejected-alternative entry first.
- **The portfolio budget posture from [ADR-0008](./0008-repo-and-runtime-topology.md) is preserved.** Drizzle is part of `packages/db` already; Neon's pooler is included in the database bill; the weekly dump uses the R2 free tier; CSP is response headers and adds zero recurring cost.
- **Restore credibility comes from rehearsal, not from the existence of a backup.** The 90-day restore exercise is the line between "we have backups" and "we have a recovery process" — documented here so it is not a discretionary item the next maintainer can quietly drop.
- **The Sentry-only telemetry posture from [ADR-0008](./0008-repo-and-runtime-topology.md) influences the CSP `connect-src`.** Adding Honeycomb later would require widening the allowlist; the inverse of dropping Sentry (e.g., moving to a different provider) requires the same. CSP is one of the surfaces a telemetry change touches.
- **Trade-off accepted: a missing rollback file disturbs engineers trained on "every migration has a down."** The convention is intentional; the up-migration is reviewed with the rollback already in mind ("if this is wrong, what's the forward fix?"), and the data-shape assumption that down migrations encode is honest about not being recoverable in the general case anyway.
- **Trade-off accepted: a permissive CSP on tenant sites lets a template ship inline scripts the renderer did not vet.** The mitigation is that template code lives in `packages/template-*` and is reviewed on the same PR path as everything else; a malicious template change cannot bypass review just because CSP would have allowed it. The narrow trust boundary is "templates ship from our review", not "CSP enforces template behavior".
