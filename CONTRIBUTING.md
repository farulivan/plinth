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
- **CI must pass.** Every PR runs the fast lane: `pnpm verify` (format, lint, typecheck, test, build) across affected packages, the cross-tenant RLS probe, and a gitleaks secret scan. The heavy gates (Playwright E2E + axe a11y, Lighthouse budgets, CodeQL) exist as workflows but run manually (`workflow_dispatch`) until the product is demo-ready — they'll flip to required then. Bypassing local hooks with `--no-verify` will be caught at PR time.
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

The script is idempotent — it copies `.env.example` to `.env` (every default already matches the compose stack), generates `BETTER_AUTH_SECRET` and `INTERNAL_API_HMAC_SECRET` if empty, installs dependencies, starts the services with health gates, creates the MinIO buckets, applies migrations, and seeds Norven as workspace #0. Re-run it anytime; it never overwrites values you've set. Then:

```bash
pnpm dev                   # both apps via Turbo: dashboard:3000 and api:4000
```

Useful local endpoints once the stack is up: Inngest dev UI at `http://localhost:8288`, MinIO console at `http://localhost:9001` (`plinth` / `plinth-local-dev`).

`pnpm install` triggers `lefthook install` via the `prepare` script, which wires the commit-msg and pre-commit git hooks. If you ever lose them (re-init the repo, swap worktrees) re-run `pnpm install` or `pnpm exec lefthook install`.

The hosted Plinth service at plinth.farulivan.com runs against production secrets that are not in this repo. Local development covers the entire dashboard and api; only Stripe webhook delivery requires a tunnel or a manual `pnpm dev:stripe-listen` to mirror live traffic.

## Day-to-day commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run both apps via Turbo (dashboard + api + watchers). |
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
- **Cloudflare Transform Rules**: apply the dashboard response-header rules and the per-tenant rules from `docs/security-headers.md` (when added) via the Cloudflare dashboard. Verify with `curl -sI https://plinth.farulivan.com/` and `curl -sI https://norven.farulivan.com/`.
- **Cloudflare for SaaS**: configure the fallback origin and the Custom Hostnames API token, scoped to the Plinth zone only.
- **Fly.io**: create two apps (`plinth-dashboard`, `plinth-api`); register the GitHub Actions OIDC issuer for deploy tokens.
- **Neon**: create the production project. (Branch-per-PR previews are deferred until there's a UI worth previewing — CI uses testcontainers for now.)
- **Inngest**: configure the production app and the signing key; mirror a staging environment for PR previews.
- **Stripe**: register the webhook receiver URL (`api.plinth.farulivan.com/webhooks/stripe`) and rotate the signing secret into Fly.io secrets.

## Code of conduct

Be kind, be specific, assume good faith. Solo open-source project, so there's no formal CoC document — this paragraph is it.

Thanks for reading.
