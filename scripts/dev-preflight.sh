#!/usr/bin/env bash
# Preflight for `pnpm dev`: the apps run on the host but need the
# docker-compose.dev.yml services. If Docker is up and the stack isn't,
# start it on demand — services exist while you work on Plinth, never as
# resident daemons squatting default ports between projects. Only "Docker
# itself is not running" needs a human.
set -euo pipefail

cd "$(dirname "$0")/.."

# Postgres is the canary — every dev feature needs it, and if the stack is
# down it's down too. /dev/tcp keeps the probe dependency-free.
if (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; then
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'EOF'

  Docker is not running, so the dev services (postgres, redis, minio,
  inngest) cannot be started. Open Docker Desktop (or start dockerd) and
  re-run `pnpm dev` — the services then start automatically.

EOF
  exit 1
fi

echo "dev services are not running — starting them…"
docker compose -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.dev.yml run --rm minio-init
echo "dev services ready."
