# Plinth

I built Plinth as a typed, multi-tenant CMS for editorial marketing sites. It is open-source under MIT and runs as a small hosted service that I operate for freelance clients who want a designed site without touching code. Norven runs as tenant #0; the same code generates every other tenant site.

**Live (hosted)**: <https://plinth.farulivan.com> · **First tenant**: <https://norven.farulivan.com> · **Source**: <https://github.com/farulivan/plinth>

[![Code license: MIT](https://img.shields.io/badge/code%20license-MIT-blue)](./LICENSE.md)

[![CI](https://github.com/farulivan/plinth/actions/workflows/ci.yml/badge.svg)](https://github.com/farulivan/plinth/actions/workflows/ci.yml)

<!--
More badges as their workflows run regularly / the Renovate app is installed:

[![CodeQL](https://github.com/farulivan/plinth/actions/workflows/codeql.yml/badge.svg)](https://github.com/farulivan/plinth/actions/workflows/codeql.yml)
[![Lighthouse](https://github.com/farulivan/plinth/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/farulivan/plinth/actions/workflows/lighthouse.yml)
[![E2E](https://github.com/farulivan/plinth/actions/workflows/e2e.yml/badge.svg)](https://github.com/farulivan/plinth/actions/workflows/e2e.yml)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen?logo=renovatebot)](https://renovatebot.com)
-->

> **Status**: foundation scaffold complete. Both runtimes boot and containerize; the cross-tenant Postgres RLS probe and the fast CI gate (`pnpm verify` + secret scan) pass on every PR; magic-link auth is wired; and the dashboard↔api contract is proven end-to-end — the typed Hono RPC client infers the api's response shape through `hc<AppType>`, so renaming a shared Zod field fails the dashboard's typecheck. Heavy CI lanes (CodeQL, Lighthouse, E2E, Fly deploys) are built and dispatch-only until the product is demo-ready.
>
> **Next**: the vertical slice — login → edit fields → live preview → publish → static tenant site. Deferred behind it: the publish pipeline (Inngest + Astro), the real Norven content port, custom domains, the editor UI, and Stripe billing. The ADRs in `docs/adr/` cover the decision surface.

## Why this exists

Plinth is open-source code under MIT and a closed-source operations layer that runs the hosted service. The codebase is meant to be read end-to-end — eleven ADRs in `docs/adr/` cover every load-bearing decision and the architecture overview fits on one screen.

It serves two readings:

- **Portfolio piece** for senior frontend / fullstack hiring filters. Production-grade CMS with multi-tenant Postgres, RLS, Inngest-orchestrated builds, Cloudflare Workers, scoped-token deploys, axe a11y on every PR, Lighthouse budgets, and eleven ADRs of decision documentation.
- **Foundation of a small freelance practice** deploying Plinth-class sites for studios who want a designed site managed through a typed dashboard. Hosted Plinth at plinth.farulivan.com; pricing on request.

This codebase demonstrates how I think about:

- **Architecture** — monorepo with two runtimes, schema-as-product through Zod packages, Postgres RLS for tenant isolation, content-addressed publishing with atomic pointer swap.
- **Quality gates** — `pnpm verify` runs format, lint, typecheck, tests, build, and bundle budget on every PR; CI adds dependency review, CodeQL, axe a11y, Lighthouse budgets, and a cross-tenant RLS probe test.
- **Operations** — Fly.io for the dashboard and api (auto-stop at idle), Cloudflare R2 for static tenant sites and media, Cloudflare for SaaS for multi-tenant TLS and edge routing, Sentry for errors, app-scoped Fly deploy tokens, secret scanning at pre-commit and CI.
- **Documentation discipline** — eleven ADRs for load-bearing decisions, an architecture overview that fits on one screen, `CONTEXT.md` fixing domain vocabulary, a deployment runbook, security policy.

## Stack

| Tool | Family | Why this | Where |
|---|---|---|---|
| [Next.js](https://nextjs.org) | ≥16, App Router | Server Actions + RSC for the dashboard; same React components consumed by the preview SSR route | `apps/dashboard/` |
| [Hono](https://hono.dev) | ≥4 | Lean Node HTTP server for upload, SSE, webhook, and Inngest endpoints — first-class SSE + typed RPC to the dashboard, keeps long-lived connections off the dashboard runtime | `apps/api/` |
| TypeScript | ≥6, `strict` | One language across every app and package; drift impossible through workspace imports | repo root |
| [Astro](https://astro.build) | ≥6 | The per-tenant publish build runs `astro build` against the snapshot — same toolchain that proved itself on Norven | `apps/api/modules/publish/` |
| [Tailwind](https://tailwindcss.com) | ≥4 | CSS-first tokens, no JS config | `apps/dashboard/`, `packages/template-norven/` |
| [Drizzle ORM](https://orm.drizzle.team) | latest | Typed migrations; the typed query builder is the only interface to Postgres | `packages/db/` |
| [Better Auth](https://www.better-auth.com) | ≥1.6 | Session model is explicit and database-shaped; magic-link + OAuth via plugins; small enough to audit end-to-end | `packages/auth/` |
| [Inngest](https://www.inngest.com) | ≥4 | Durable queue + DLQ for publish, reaper, and KV sync jobs | `apps/api/inngest/` |
| [Sharp](https://sharp.pixelplumbing.com) | ≥0.34 | AVIF + WebP at upload time | `apps/api/modules/media/` |
| [Zod](https://zod.dev) | ≥4 | Schema is the product — shared by editor form generation, API validation, DB inference, renderer typing | `packages/schema/` |
| [Vitest](https://vitest.dev) | ≥4 | Unit tests on every service | `**/*.test.ts` |
| [Playwright](https://playwright.dev) + [axe-core](https://github.com/dequelabs/axe-core) | latest | E2E + WCAG AA gates | `tests/e2e/` |
| [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | ≥0.15 | Per-route budgets on the dashboard preview | `.lighthouserc.json` |
| [Postgres](https://www.postgresql.org) on [Neon](https://neon.tech) | ≥16 | Branch-per-PR for preview environments | shared |
| [Cloudflare for SaaS](https://www.cloudflare.com/products/cloudflare-for-platforms/) | — | Multi-tenant TLS, edge routing, KV for hostname lookup | per-tenant routing |
| [Fly.io](https://fly.io) | — | Container deploys for both apps; OIDC-issued tokens | both apps |
| GitHub Actions + OIDC | — | Deploy on push to `main` with no long-lived credentials | `.github/workflows/` |

Node `>=22.12.0` (development tracks the current LTS via `.nvmrc`), package manager `pnpm >=11`. Exact pins live in the root `package.json` (`engines`, `packageManager`) and per-package manifests — this table records minimums so the prose doesn't rot with every release. The scaffold tracks the latest stable of each tool; if a peer-dependency conflict ever forces one back, the drop is noted in that commit, not here.

## Key decisions

Eleven ADRs cover every load-bearing decision. They are short, self-contained, and each documents the rejected alternatives:

- [ADR-0001 · Editor model](./docs/adr/0001-editor-model.md) — field-based editor against a shared Zod schema; visual canvas rejected.
- [ADR-0002 · Tenant isolation](./docs/adr/0002-tenant-isolation.md) — `workspace_id` on every row + Postgres RLS enforced by a session-level GUC.
- [ADR-0003 · Publish pipeline](./docs/adr/0003-publish-pipeline.md) — Inngest queue + per-tenant Astro build + content-addressed snapshots + atomic pointer swap.
- [ADR-0004 · Custom domains](./docs/adr/0004-custom-domains.md) — Cloudflare for SaaS for automated TLS + hostname-to-workspace routing at the edge.
- [ADR-0005 · Auth](./docs/adr/0005-auth-model.md) — Better Auth with DB-backed sessions and magic-link as the primary login.
- [ADR-0006 · Media pipeline](./docs/adr/0006-media-pipeline.md) — Sharp at upload time on the api, content-addressed R2 paths, Cloudflare CDN delivery.
- [ADR-0007 · Preview architecture](./docs/adr/0007-preview-architecture.md) — single renderer module, draft SSR through Next, SSE-driven iframe reloads.
- [ADR-0008 · Repo + runtime topology](./docs/adr/0008-repo-and-runtime-topology.md) — pnpm monorepo with two runtimes (dashboard + api); drift impossible through workspace imports.
- [ADR-0009 · Backend architecture](./docs/adr/0009-backend-architecture.md) — module-per-domain with three-rule layering and no DI ceremony.
- [ADR-0010 · Product strategy](./docs/adr/0010-product-strategy.md) — MIT code, ARR brand, hosted service as the commercial surface.
- [ADR-0011 · Operational baseline](./docs/adr/0011-operational-baseline.md) — forward-only migrations, Neon pooler, PITR + weekly R2 dumps, per-surface CSP.

## Architecture

[ARCHITECTURE.md](./ARCHITECTURE.md) is the one-screen orientation: render and runtime model, module layering across the monorepo, content state machine, publish and preview lifecycles, image pipeline, and the build/deploy boundary — with Mermaid diagrams that render on GitHub. [CONTEXT.md](./CONTEXT.md) fixes the domain vocabulary so every word in the ADRs traces to a defined entity.

## Quick start

```bash
git clone https://github.com/farulivan/plinth.git
cd plinth
pnpm install              # installs workspaces + lefthook git hooks
cp .env.example .env      # fill in DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, ...
pnpm db:push              # apply Drizzle schema to a local or branched Postgres
pnpm dev                  # runs apps/dashboard:3000 and apps/api:4000 via Turbo
```

For a hosted-Plinth tenant: open <https://plinth.farulivan.com> and sign in. The freelance workflow includes a 30-minute discovery call before onboarding.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run both apps locally via Turbo (dashboard + api + watcher) |
| `pnpm build` | Production build for every app and package |
| `pnpm test` | Vitest unit tests across the workspace |
| `pnpm test:e2e` | Playwright E2E + axe-core a11y against the dashboard |
| `pnpm test:integration` | Integration tests against a testcontainers Postgres (includes cross-tenant RLS probe) |
| `pnpm lint` / `pnpm format` | ESLint + Prettier across the workspace |
| `pnpm check` | TypeScript typecheck across every package |
| `pnpm db:push` / `pnpm db:migrate` / `pnpm db:studio` | Drizzle schema management |
| `pnpm verify` | Full gate: format + lint + check + test + build + bundle budget |
| `pnpm deploy:dashboard` / `pnpm deploy:api` | Fly.io deploys (CI runs these on push to `main`) |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full setup, Conventional Commits expectations, and PR expectations.

## Deployment

The dashboard and api deploy as separate Fly.io apps with auto-stop at idle; tenant sites are written directly to Cloudflare R2 from the publish worker and served through Cloudflare's edge — static files stay up even while both apps sleep. GitHub Actions authenticates to Fly.io via OIDC; Cloudflare access uses scoped API tokens stored as repository secrets — no long-lived cloud credentials anywhere. Operational details, security model, cost analysis, and runbook live in [docs/deployment.md](./docs/deployment.md) (when it lands). Security headers follow [ADR-0011](./docs/adr/0011-operational-baseline.md): CSP per surface, the rest as Cloudflare Transform Rules mirroring Norven's posture.

## Project structure

```
.
├── ARCHITECTURE.md        # one-screen orientation
├── CONTEXT.md             # domain vocabulary
├── CONTRIBUTING.md        # local setup, PR conventions
├── LICENSE.md             # MIT code + ARR brand
├── SECURITY.md            # vulnerability disclosure
├── README.md              # start here
├── apps/
│   ├── dashboard/         # Next.js App Router — UI + auth + Server Actions
│   └── api/               # Hono Node service — uploads, SSE, webhooks, Inngest
├── packages/
│   ├── schema/            # Zod schemas — single source of truth
│   ├── db/                # Drizzle client + RLS helper + migrations
│   ├── auth/              # Better Auth config + session validator
│   ├── renderer/          # React components shared between Astro build + preview SSR
│   ├── template-norven/   # first template (Norven editorial shape)
│   └── ui/                # shadcn primitives for the dashboard
├── docs/
│   ├── adr/               # 10 ADRs for every load-bearing decision
│   ├── deployment.md      # operations runbook (TBD)
│   └── operations.md      # reapers + KV sync + DLQ playbook (TBD)
├── .github/
│   └── workflows/         # ci, deploy-dashboard, deploy-api, codeql, lighthouse, e2e
└── turbo.json             # Turborepo pipeline config
```

## Dual-use note

Plinth is open source under MIT — read, fork for personal use, copy patterns into other projects. It is also the foundation of a small freelance practice deploying Plinth-class sites under the Plinth brand at plinth.farulivan.com. The hosted service is what tenants pay for; the code is what the public sees.

Forks running under a different brand are permitted. The Plinth name, logo, marketing prose, and the Norven reference template content are reserved. See [LICENSE.md](./LICENSE.md) for the full breakdown and [ADR-0010](./docs/adr/0010-product-strategy.md) for the reasoning.

## License

[LICENSE.md](./LICENSE.md) — three sections:

- **Code** under MIT.
- **Brand and copy** (Plinth name, marks, marketing prose, dashboard chrome copy) all rights reserved.
- **Reference content** (Norven fictional studio prose, fictional team and project content) all rights reserved; **photographs** licensed via Unsplash.
