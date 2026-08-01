# Contributing

Plinth is a personal portfolio piece and the foundation of a small freelance practice. Contributions are welcome but review happens asynchronously, on my schedule, and I'm selective about scope — feature work that diverges from the freelance roadmap may be declined, and the contributor's fork remains MIT for them to run themselves. Read this once before opening anything.

## Before you open anything

- **Bug report?** Use the bug report issue form.
- **Feature request?** Use the feature request issue form. The shape mirrors how decisions are documented in `docs/adr/` so a well-formed feature request can graduate to an ADR with minimal rewriting.
- **Security issue?** Don't open a public issue. See [SECURITY.md](./SECURITY.md) for the disclosure channel.
- **Hosted-Plinth tenant question?** Email <farulivan@gmail.com>. The hosted service is a freelance engagement; GitHub issues are for the open-source code.
- **Anything else?** Reach me on GitHub.

## Pull requests

PRs are welcome for clear, scoped changes. For anything beyond a small bug fix or typo, **open an issue first** so I can align with you before code lands.

A few things to know:

- **Brand and copy are reserved.** Don't change the Plinth name, wordmark, dashboard chrome copy, or any prose in `packages/template-norven/example-content/`. See [LICENSE.md](./LICENSE.md) for what's MIT and what isn't.
- **Decisions are documented in `docs/adr/`.** If your PR changes the shape of something (the editor model, the publish pipeline, the tenant isolation pattern), the ADRs explain why the current shape exists. Either update the relevant ADR or note in the PR why the new shape supersedes it.
- **Vocabulary lives in `CONTEXT.md`.** New entities or actions in the code should be added to `CONTEXT.md` so the docs and the code use the same words. Don't invent a synonym for "workspace" or "version".
- **CI must pass.** Every PR runs the fast lane — `pnpm verify` (format, lint, typecheck, test, build) across affected packages, the cross-tenant RLS probe, a gitleaks secret scan, and two supply-chain checks: `pnpm audit --prod` against the accepted-advisory list in `pnpm-workspace.yaml`, and a dependency review of what the PR itself adds. The heavier lanes now run on PRs too, path-filtered: Playwright E2E + axe a11y, Lighthouse budgets, CodeQL, and a production-image build that boots both containers and asserts the dashboard's response-header contract. Only `verify` and `secret scan` are *required* to merge; the rest report until the product is demo-ready. Bypassing local hooks with `--no-verify` will be caught at PR time.
- **The cross-tenant RLS probe is a ship-block.** A regression in `packages/db` policies or in the GUC middleware that lets tenant A read tenant B's rows fails this test before any feature change can land. Per [ADR-0002](./docs/adr/0002-tenant-isolation.md).

## Local setup

Prerequisites:

- Node `>=22.12.0` (`engines.node` floor; development tracks Node 24 via `.nvmrc`).
- `pnpm >=11` (exact version pinned in root `package.json` `packageManager`).
- Docker — runs the local service stack (`docker-compose.dev.yml`: Postgres, Redis behind an Upstash-REST proxy, the Inngest dev server, MinIO standing in for R2) and testcontainers Postgres during integration tests.
- `openssl` (generates local secrets; preinstalled on macOS/Linux).

Setup is three commands:

```bash
git clone https://github.com/farulivan/plinth.git
cd plinth
./scripts/dev-setup.sh
```

The script is idempotent — it copies `.env.example` to `.env` (every default already matches the compose stack), generates `BETTER_AUTH_SECRET` and `INTERNAL_API_HMAC_SECRET` if empty, symlinks that root `.env` into `apps/dashboard/` so Next loads it for `pnpm dev` (the api reads the root `.env` directly via `--env-file`), installs dependencies, starts the services with health gates, creates the MinIO buckets, applies migrations, and seeds Norven as workspace #0. Re-run it anytime; it never overwrites values you've set. Then:

```bash
pnpm dev                   # both apps via Turbo: dashboard:3000 and api:4000
```

Sign in as `dev@plinth.local` (or any email). Without a Resend key the magic-link URL prints to the dashboard task's logs — open it from there.

Useful local endpoints once the stack is up: Inngest dev UI at `http://localhost:8288`, MinIO console at `http://localhost:9001` (`plinth` / `plinth-local-dev`).

### Production-parity run

`pnpm dev` optimizes for iteration speed; `pnpm local-prod` optimizes for catching what dev mode structurally cannot. It builds the **same Docker images the Fly deploys ship**, boots them with `NODE_ENV=production` and the runtime env contract validated for real (no `SKIP_ENV_VALIDATION`), applies migrations through the same `drizzle-kit migrate` path the deploy lane runs, seeds, and finishes with `scripts/smoke.sh` — liveness on both apps, the HMAC trust boundary, and magic-link issuance.

```bash
pnpm local-prod            # build → postgres → migrate + seed → boot → smoke
pnpm local-prod:down       # tear down
```

Run it before opening a PR that touches Dockerfiles, dependencies, build config, or env contracts (CI's `Images` workflow builds and boots both images on such PRs as a backstop). The stack binds the same `:3000`/`:4000` as `pnpm dev` — run one mode at a time.

`pnpm install` triggers `lefthook install` via the `prepare` script, which wires the commit-msg and pre-commit git hooks. If you ever lose them (re-init the repo, swap worktrees) re-run `pnpm install` or `pnpm exec lefthook install`.

The hosted Plinth service at plinth.farulivan.com runs against production secrets that are not in this repo. Local development covers the entire dashboard and api; only Stripe webhook delivery requires a tunnel or a manual `pnpm dev:stripe-listen` to mirror live traffic.

## Day-to-day commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run both apps via Turbo (dashboard + api + watchers). |
| `pnpm local-prod` / `pnpm local-prod:down` | Boot / tear down the production images against a local stack. |
| `pnpm seed` | Seed Norven as workspace #0 with a dev user and a sample draft (idempotent). |
| `pnpm smoke` | Smoke-test a running deployment (liveness, HMAC boundary, magic-link issuance). |
| `pnpm build` | Production build for every app and package. |
| `pnpm test` | Vitest unit tests across the workspace. |
| `pnpm test:integration` | Integration tests against testcontainers Postgres (includes cross-tenant RLS probe). |
| `pnpm test:e2e` | Playwright E2E + axe-core a11y against the dashboard. |
| `pnpm lint` / `pnpm format` | ESLint + Prettier across the workspace. |
| `pnpm typecheck` | TypeScript typecheck across every package. |
| `pnpm db:push` | Apply the current Drizzle schema to `DATABASE_URL` (dev shortcut). |
| `pnpm db:generate` | Generate a migration file from a schema change. |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `pnpm db:studio` | Drizzle Studio web UI for inspecting tenant data locally. |
| `pnpm verify` | The full gate. Run before pushing if you bypassed local hooks. |
| `pnpm dev:stripe-listen` | Forward Stripe test-mode webhooks to local `apps/api`. |

For an orientation to the codebase shape, read [ARCHITECTURE.md](./ARCHITECTURE.md) first, then [CONTEXT.md](./CONTEXT.md) for vocabulary, then the relevant ADR.

## Commit and PR conventions

- **Conventional Commits.** `commitlint` enforces this at both the local `commit-msg` hook and in CI on every commit between `origin/main` and HEAD. Format: `type(scope): short description`. The scope should be either an app (`dashboard`, `api`), a package (`schema`, `db`, `renderer`, `auth`, `ui`, `template-norven`), or a cross-cutting concern (`ci`, `docs`, `infra`).
- **PR template** prefills with what / why / how / visuals / verification / decisions slots. The verification checklist is real — actually run those gates locally before requesting review.
- **One concern per PR.** Easier to review, easier to revert.
- **Cross-cutting changes get an ADR.** If you're changing tenant isolation, auth, publish, preview, or the renderer contract, expect to land an ADR (or a delta against an existing ADR) alongside the code. The ADR is the durable artifact; the code is the implementation.

## Hosted-Plinth tenant work

The freelance workflow is separate from the open-source repository. Tenant onboarding, branding work, custom templates, and bespoke integrations happen on private branches or in client-specific private repositories. Public PRs that introduce hosted-Plinth-only features will be redirected to the appropriate private repo or closed with a note.

## Maintainer setup (one-time, for me)

These are the manual steps a fresh clone can't automate. I keep them here so they're not lost.

- **Renovate**: install the [Renovate GitHub App](https://github.com/apps/renovate) on `farulivan/plinth`. Merge the onboarding PR. The committed `renovate.json` does the rest.
- **Branch protection on `main`**: require the fast `CI / Verify` check (which includes the RLS probe) before merge. When the product is demo-ready, flip the heavy workflows (E2E, Lighthouse, CodeQL) from `workflow_dispatch` to PR triggers and add them as required checks.
- **Cloudflare Transform Rules**: none needed for the dashboard — its headers ship from the app itself (ADR-0011). Still worth a post-deploy check that nothing at the edge strips them: `curl -sI https://plinth.farulivan.com/login` and `curl -sI https://norven.farulivan.com/`.
- **Cloudflare for SaaS**: configure the fallback origin and the Custom Hostnames API token, scoped to the Plinth zone only.
- **Fly.io**: create two apps (`plinth-farulivan-dashboard`, `plinth-farulivan-api`); register the GitHub Actions OIDC issuer for deploy tokens.
- **Neon**: create the production project. (Branch-per-PR previews are deferred until there's a UI worth previewing — CI uses testcontainers for now.)
- **Inngest**: configure the production app and the signing key; mirror a staging environment for PR previews.
- **Stripe**: register the webhook receiver URL (`api.plinth.farulivan.com/webhooks/stripe`) and rotate the signing secret into Fly.io secrets.

## Code of conduct

Be kind, be specific, assume good faith. Solo open-source project, so there's no formal CoC document — this paragraph is it.

Thanks for reading.
