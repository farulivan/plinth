# CONTEXT

I keep Plinth's domain language and load-bearing decisions here. This pairs with `docs/adr/` (why I made each decision) and the README (how to navigate the codebase). Keep entries short.

## What Plinth is

A typed, multi-tenant CMS for editorial marketing sites. A tenant picks a template, fills typed fields in a dashboard, and publishes to their own hostname. The first template is the Norven shape (architecture-studio editorial); more templates are additive. Norven runs as tenant #0 of the hosted service.

## Tenancy

A **workspace** is one tenant — one site, one billing relationship, one content namespace. A **user** can belong to multiple workspaces; the currently active one is stored on the **session**. A **membership** ties a user to a workspace with a role (`owner`, `editor`). Every tenant-owned row carries `workspace_id`; isolation is enforced by Postgres Row-Level Security per [ADR-0002](./docs/adr/0002-tenant-isolation.md). "Tenant" and "workspace" are interchangeable in conversation; the database column is always `workspace_id`.

## Content model

Three states for a tenant's content:

- **Draft** — the current editing state of a workspace's site. One row in `content_drafts` per workspace. Mutated by Server Actions when the editor saves. Never directly rendered to the public web.
- **Version** — an immutable snapshot of a draft at the moment Publish was clicked. Rows in `content_versions(id, workspace_id, snapshot jsonb, created_at, created_by)`. A version is what the publish job renders.
- **Snapshot** — the JSON content embedded in a version. The same shape as a draft, frozen.

Actions:

- **Publish** — validate the draft, insert a version row, enqueue an Inngest build job ([ADR-0003](./docs/adr/0003-publish-pipeline.md)). The web request returns once the version row exists.
- **Promote** — the atomic pointer swap: `UPDATE workspaces SET current_version_id = $version` after a successful build. The Cloudflare Worker sees the new version on the next KV sync.
- **Rollback** — promote a prior version. The build artifacts for old versions stay in S3 until the reaper sweeps them.

## Template and rendering

A **template** is a package implementing the render interface: it takes a content shape (typed via Zod from `packages/schema`) and returns the rendered page. The first template is `packages/template-norven`. Plinth is template-aware, not tenant-aware — the active template per workspace lives on the `workspaces` row.

- **Renderer** (`packages/renderer`) — the React components shared between Astro builds (publish-time, static output) and the dashboard preview route (Next SSR, real-time). One module, two trigger points, no drift per [ADR-0007](./docs/adr/0007-preview-architecture.md).
- **Section** — a block within a template (Hero, ProjectGrid, Statement, etc.). Each section type declares its own Zod schema in `packages/schema`. A tenant picks which sections appear and in what order; layout inside a section is fixed by the template.
- **Schema** — the Zod definitions that flow through editor (form generation), API (validation), and renderer (typed content prop). Schema is the product per [ADR-0001](./docs/adr/0001-editor-model.md).

## Media

Image uploads are processed at upload time, not at publish time ([ADR-0006](./docs/adr/0006-media-pipeline.md)).

- **Media** — a single source image with its variants. Rows in the `media` table, one per `(workspace_id, content_hash)`.
- **Variant** — a single rendition of a source image: one width, one format. Variants live in S3 at `tenants/{workspace_id}/{content_hash}/w{width}.{format}`; the standard widths are `[400, 800, 1200, 1600]` in AVIF + WebP + JPEG.
- **Media library** — the dashboard view onto a workspace's `media` rows. The library is the source of all image fields; sections never upload directly.

Alt text lives on the field that references the media row, not on the media row itself.

## Routing and domains

Every workspace gets a subdomain (`studio.plinth.app`) and may bind one or more custom hostnames ([ADR-0004](./docs/adr/0004-custom-domains.md)).

- **Subdomain tenant** — uses the default Plinth subdomain.
- **Custom-domain tenant** — has at least one verified row in `custom_domains`. Hostname binding is done through Cloudflare for SaaS; TLS is automatic.
- **Fallback hostname** — the CNAME target tenants point their custom domain at (`tenant-fallback.plinth.farulivan.com`).
- **Worker (`worker-router`)** — the Cloudflare Worker that reads the `Host` header, looks up `workspace_id` and `current_version_id` from KV, and rewrites the origin path to `s3://plinth-sites/tenants/{workspace_id}/v{N}/…`.
- **KV** — Cloudflare's edge key-value store. Synced from Postgres via Inngest on every promote and on every domain change; convergence is eventual on the order of seconds.

## Auth

Email magic-link via Resend is the primary login; OAuth (Google) is a second path added after magic-link is solid ([ADR-0005](./docs/adr/0005-auth-model.md)).

- **Session** — a row in `sessions`. Sliding 30-day expiry. Carries `active_workspace_id` so workspace switching is a session update, not a re-login.
- **GUC** — Postgres session variable. `app.workspace_id` is set by the request middleware before any tenant query; RLS reads it via `current_setting`.
- **Reaper (sessions)** — daily Inngest job that deletes expired session rows.

## Background work

All asynchronous work runs through Inngest functions in `apps/api/inngest/`:

- **Publish** — consumes publish events, runs `astro build`, uploads to S3, calls promote.
- **Reaper** — sweeps expired sessions, orphaned media, old content versions. One job per target.
- **KV sync** — propagates `workspaces.current_version_id` and `custom_domains` changes to Cloudflare KV.
- **Webhook receivers** — Stripe, Cloudflare, Resend bounce notifications.

A privileged role bypasses RLS inside background jobs; each job sets the `workspace_id` GUC explicitly before reading tenant data ([ADR-0002](./docs/adr/0002-tenant-isolation.md)).

## Architecture vocabulary

- **Module** (`apps/api/modules/{domain}/`) — one folder per domain area (media, publish, domains, preview). Inside: `service.ts` (business logic), optional adapter files, optional `db.ts` for repeated queries. Per [ADR-0009](./docs/adr/0009-backend-architecture.md).
- **Adapter** — a one-file wrapper around a third-party SDK (`storage.ts` for S3, `cloudflare.ts` for the CF API, `stripe.ts`, `resend.ts`). Services call adapters; routes do not.
- **Service** — a plain function or set of functions inside a module. Accepts typed input, returns typed output. Never sees `req`/`res`.
- **Server Action** — a Next App Router server function on the dashboard side. Delegates to a dashboard service mirroring the api/module shape.

## Commercial surface

- **Hosted Plinth** — the SaaS at plinth.farulivan.com that I operate. Tenants pay monthly per workspace.
- **Self-hosted Plinth** — the MIT-licensed code. Anyone can run it under their own brand; the Plinth brand is reserved per [ADR-0010](./docs/adr/0010-product-strategy.md).
- **Free / Paid / Enterprise tier** — three SKUs differentiated by hostname quota, storage cap, publish-per-day cap, and seat count. Tier metadata lives on the `workspaces` row.
- **Studio (customer archetype)** — the freelance target client: architecture, photography, design, small agencies. The first hosted-Plinth customer profile.

## Deferred

- **Open-core paid templates** — a separate private repo with paid template packages, gated behind workspace tier. Not in MVP; the next reasonable product step.
- **Multi-language content** — a tenant may eventually want their site in two languages with synchronized drafts. Schema adds a `locale` discriminant on every field. Not in MVP.
- **Real-time multi-user editing** — two editors on the same draft. CRDT or operational-transform layer. Not in MVP; the SSE channel is the seam.
- **Per-tenant analytics** — Plausible/Umami workspace per tenant or a hosted equivalent. Not in MVP.
