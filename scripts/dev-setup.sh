#!/usr/bin/env bash
# One-command local setup: env file, secrets, deps, services, migrate, seed.
# Idempotent — safe to re-run anytime.
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf "\n\033[1;34m▸ %s\033[0m\n" "$1"; }

step "checking prerequisites"
command -v docker >/dev/null || { echo "docker is required: https://docs.docker.com/get-docker/"; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon is not running"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required: https://pnpm.io/installation"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required to generate local secrets"; exit 1; }

step "preparing .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "created .env from .env.example"
else
  echo ".env already exists — leaving your values untouched"
fi

# Fill KEY= with a generated value only when currently empty (portable awk, no sed -i).
fill_secret() {
  local key="$1"
  if grep -q "^${key}=$" .env; then
    local value
    value="$(openssl rand -base64 32)"
    awk -v k="$key" -v v="$value" 'index($0, k"=") == 1 && $0 == k"=" { print k "=" v; next } { print }' .env > .env.tmp
    mv .env.tmp .env
    echo "generated ${key}"
  else
    echo "${key} already set"
  fi
}
fill_secret BETTER_AUTH_SECRET
fill_secret INTERNAL_API_HMAC_SECRET

step "linking the dashboard to the shared .env"
# Next only auto-loads .env from the app dir, so symlink the monorepo-root .env
# into apps/dashboard for `next dev`/`next start`. (The api uses --env-file; the
# build skips validation, so neither needs this.)
ln -sf ../../.env apps/dashboard/.env
echo "apps/dashboard/.env -> ../../.env"

step "installing dependencies (also wires git hooks via lefthook)"
pnpm install

step "starting local services (postgres, redis + upstash proxy, inngest, minio)"
docker compose -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.dev.yml run --rm minio-init

step "database migrations"
if [ -f packages/db/package.json ]; then
  pnpm --filter @plinth/db db:migrate
else
  echo "skipped — packages/db not scaffolded yet (lands with the package-db branch)"
fi

step "seed data"
node scripts/seed.ts

step "done"
cat <<'EOF'

  Services:
    Postgres        postgres://plinth:plinth@localhost:5433/plinth
    Upstash REST    http://localhost:8079  (token: local-dev-token)
    Inngest UI      http://localhost:8288
    MinIO console   http://localhost:9001  (plinth / plinth-local-dev)

  Next:
    pnpm dev        # dashboard :3000 + api :4000 (once the app branches land)
    docker compose -f docker-compose.dev.yml down   # stop services

EOF
