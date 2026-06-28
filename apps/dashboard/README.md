# @plinth/dashboard

The Plinth dashboard — a Next.js (App Router) admin UI. Authenticated editors
manage content here; it talks to `@plinth/api` over a type-safe Hono RPC client
behind an HMAC envelope (ADR-0008).

## Develop

From the monorepo root:

```sh
pnpm install
pnpm --filter @plinth/dashboard dev   # http://localhost:3000
```

Reads the shared root `.env` (see `.env.example`).
