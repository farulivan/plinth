# @plinth/api

Hono API for Plinth — the internal RPC surface the dashboard calls, plus the
media / publish / domains modules (ADR-0008, ADR-0009).

## Develop

Needs a repo-root `.env` (copy from `.env.example`). Then:

```sh
pnpm --filter @plinth/api dev
```

Serves on `http://localhost:4000` (override with `PORT`).
