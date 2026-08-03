#!/usr/bin/env bash
# Build a real tenant site from the committed example-content fixture, with no
# Postgres, R2 or Inngest in the loop. This is what the tenant quality gates
# audit: the same astro build the publish job runs (ADR-0013), against the same
# renderer and template, with the same media bytes a real upload would produce.
#
# The media tree is copied in rather than living in site-builder/public/,
# because public/ ships with every real tenant build — the fixture must never
# leak into a customer's site.
#
#   ./scripts/build-tenant-fixture.sh [out-dir]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$ROOT/packages/template-norven/example-content"
OUT="${1:-$ROOT/.tenant-fixture}"

if [ ! -f "$FIXTURE/norven.json" ]; then
  echo "Fixture missing — regenerate it with \`pnpm example-content\`." >&2
  exit 1
fi

rm -rf "$OUT"

SNAPSHOT_PATH="$FIXTURE/norven.json" \
TEMPLATE_ID="template-norven" \
SITE_TITLE="Norven" \
OUT_DIR="$OUT" \
  pnpm --filter @plinth/site-builder build:site

# Variants resolve at /_media/{contentHash}/w{width}.{format} (ADR-0014). The
# worker serves these from R2 in production; here they sit beside the build so
# a static server can answer them.
mkdir -p "$OUT/_media"
cp -R "$FIXTURE/media/." "$OUT/_media/"

echo "Tenant fixture built at $OUT"
