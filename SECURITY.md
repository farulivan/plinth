# Security policy

Plinth handles tenant data: user accounts, content drafts, uploaded media, audit logs. The hosted service at plinth.farulivan.com runs with real users and real billing. The attack surface includes the dashboard runtime, the api runtime, multi-tenant Postgres isolation (Row-Level Security), session auth (Better Auth), custom-hostname binding (Cloudflare for SaaS), webhook receivers (Stripe, Cloudflare, Inngest), and the Cloudflare edge configuration. If you've found something, please report it.

## Reporting a vulnerability

**Please don't open a public issue for a security report.** Use one of the following private channels instead:

1. Open a private security advisory at <https://github.com/farulivan/plinth/security/advisories/new>. This is the preferred path — it keeps the report off the public tracker and gives both sides a private place to discuss a fix.
2. If you can't access the security advisories interface, email me directly: `farulivan@gmail.com`. Put `[security]` in the subject line.

When reporting, include enough detail to reproduce the issue: the affected URL, route, or commit; repro steps; the expected versus observed behaviour; and any proof-of-concept you have. For a multi-tenant issue specifically, please be careful not to access another tenant's data beyond what's necessary to demonstrate the vulnerability — a self-test against two workspaces you control is sufficient and ideal.

## Response expectations

This is a one-author project, not a vendor SLA, but I take security reports seriously, particularly anything that affects tenant data isolation.

| Stage | Target |
|---|---|
| Acknowledgement that the report was received | within 3 days |
| Initial assessment (in scope, severity, reproducible) | within 7 days |
| Fix or mitigation in production | tenant-isolation issues within 7 days; other critical within 30 days; others on a best-effort basis |
| Coordinated disclosure (if applicable) | by mutual agreement; default 90 days from initial report |

If you'd like credit in the fix commit, the relevant ADR, or a release note, mention it in the report and I'll honour it unless you'd rather stay anonymous.

There is no paid bug bounty at this scale. If a report meaningfully strengthens Plinth's security and you'd like to be acknowledged publicly, the Plinth marketing site has a thanks section that I keep updated.

## What's in scope

- **Multi-tenant isolation** — anything that lets workspace A read or write workspace B's content, media, drafts, versions, sessions, audit log entries, or custom hostnames. Top priority.
- **Authentication** — magic-link consumption flaws (replay, race conditions on `SELECT ... FOR UPDATE`, single-use bypass), session fixation, CSRF posture, OAuth implementation flaws (when OAuth ships), account takeover paths.
- **Authorization** — workspace membership role bypass, custom-domain binding hijack, paid-tier feature gate bypass.
- **Webhook receivers** — signature validation flaws in the Stripe, Cloudflare, or Inngest webhook handlers; replay attacks against idempotency keys.
- **Custom-hostname flow** — binding a hostname to a workspace you don't control; verification check bypass; TLS cert misissuance via the CF for SaaS flow.
- **Publish pipeline** — injection of malicious content into a snapshot or a built tenant site that affects other tenants; build worker privilege escalation; bypassing the per-tenant rate cap to abuse build minutes.
- **Media pipeline** — Sharp / libvips memory corruption from malicious uploads; path traversal in S3 keys; per-tenant storage cap bypass; orphaned-blob deletion that affects another tenant.
- **Deploy infrastructure** — Fly.io OIDC trust policy issues; AWS IAM role scope; GitHub Actions workflow injection; secret exposure in CI logs.
- **Edge configuration** — Cloudflare Transform Rules; CSP gaps that allow injection from a tenant snapshot to escape its sandbox; KV namespace permission issues.

## What's out of scope

- Issues in third-party dependencies that don't materially affect this deployment. File those upstream; `pnpm audit`, `actions/dependency-review-action`, and CodeQL already catch them at PR time.
- DDoS, volumetric, or rate-limit reports against the hosted service — Cloudflare's free-tier DDoS protection plus the Upstash Redis rate limits handle the layer this product cares about. A novel rate-limit bypass against a tenant-scoped action is in scope.
- Social-engineering reports against me.
- Self-XSS or attacks that require an attacker-controlled browser extension on the victim's machine.
- Reports against forks running under a different brand. Plinth's security posture is what I operate at plinth.farulivan.com; forks may diverge.
- Pure information-disclosure reports about already-public information (open-source repo contents, the ADRs, the hosted marketing copy).

## Hardening already in place

If you're evaluating the existing posture before reporting, these are the documents worth reading first:

- [ADR-0002 · Tenant isolation](./docs/adr/0002-tenant-isolation.md) — how `workspace_id` + Postgres RLS + the session-level GUC enforce isolation; the cross-tenant probe test that runs on every PR.
- [ADR-0005 · Auth model](./docs/adr/0005-auth-model.md) — session shape, magic-link consumption protocol, CSRF posture, OAuth path.
- [ADR-0003 · Publish pipeline](./docs/adr/0003-publish-pipeline.md) — idempotency keys, build privilege boundary, audit logging.
- [ADR-0004 · Custom domains](./docs/adr/0004-custom-domains.md) — hostname verification flow, KV sync security model, unique hostname constraint at the DB level.
- [ADR-0006 · Media pipeline](./docs/adr/0006-media-pipeline.md) — upload validation, MIME magic-byte sniffing, storage cap enforcement, orphan reaper boundary.
- `docs/security-headers.md` (to be added) — the Cloudflare Transform Rules for both the dashboard and per-tenant sites, with rationale per directive.
- `docs/deployment.md` (to be added) — the Fly.io OIDC trust policy, AWS IAM scope, secret separation per app, and the four-gate deploy auth chain.

Thank you for taking the time.
