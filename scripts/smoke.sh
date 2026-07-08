#!/usr/bin/env bash
# Smoke tests for a running Plinth deployment: liveness on both apps, the HMAC
# trust boundary (unsigned rejected, signed accepted, tampered query rejected),
# and magic-link issuance (dashboard env contract + auth + a real db write).
#
# Defaults target the local-prod stack; override for any deployment:
#   API_URL / DASHBOARD_URL / INTERNAL_API_HMAC_SECRET
set -euo pipefail

cd "$(dirname "$0")/.."

API_URL="${API_URL:-http://localhost:4000}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
if [ -z "${INTERNAL_API_HMAC_SECRET:-}" ] && [ -f .env.local-prod ]; then
  INTERNAL_API_HMAC_SECRET="$(grep '^INTERNAL_API_HMAC_SECRET=' .env.local-prod | cut -d= -f2-)"
fi
if [ -z "${INTERNAL_API_HMAC_SECRET:-}" ]; then
  echo "smoke: INTERNAL_API_HMAC_SECRET is not set and .env.local-prod not found" >&2
  exit 1
fi

pass=0
fail=0
ok() { echo "  ok   $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL $1"; fail=$((fail + 1)); }

status_of() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }

echo "smoke: liveness"
[ "$(status_of "$API_URL/health")" = "200" ] && ok "api /health" || bad "api /health"
[ "$(status_of "$DASHBOARD_URL/api/health")" = "200" ] && ok "dashboard /api/health" || bad "dashboard /api/health"

echo "smoke: hmac trust boundary"
[ "$(status_of "$API_URL/media")" = "401" ] && ok "unsigned request rejected" || bad "unsigned request rejected"

ts="$(date +%s000)"
sig="$(printf '%s\nGET\n/media\n' "$ts" | openssl dgst -sha256 -hmac "$INTERNAL_API_HMAC_SECRET" -r | cut -d' ' -f1)"
signed_body="$(curl -s --max-time 10 -H "x-plinth-timestamp: $ts" -H "x-plinth-signature: $sig" "$API_URL/media" || true)"
case "$signed_body" in
  *'"ok":true'*) ok "signed request returns the envelope" ;;
  *) bad "signed request returns the envelope (got: ${signed_body:-<empty>})" ;;
esac
[ "$(status_of -H "x-plinth-timestamp: $ts" -H "x-plinth-signature: $sig" "$API_URL/media?page=2")" = "401" ] \
  && ok "same signature with tampered query rejected" || bad "same signature with tampered query rejected"

echo "smoke: dashboard→api rpc"
# The edge proxy gates on cookie *presence* only (real session checks come
# later in the stack), so a dummy cookie reaches the media page — whose server
# side makes a real signed RPC to INTERNAL_API_URL. Rendering "No media yet."
# proves the dashboard signed, the api verified, and the envelope round-tripped
# over the deployment's internal network.
media_html="$(curl -s --max-time 10 -H "Cookie: better-auth.session_token=smoke-probe" "$DASHBOARD_URL/media" || true)"
case "$media_html" in
  *"No media yet."* | *'data-section='*) ok "media page round-trips the internal rpc" ;;
  *) bad "media page round-trips the internal rpc" ;;
esac

echo "smoke: auth flow"
# Issues a real magic link: validates the dashboard's runtime env contract,
# Better Auth wiring, and a write to the verification table in one call. The
# link itself prints to the dashboard logs (stdout sender — no Resend key).
magic_status="$(status_of -X POST "$DASHBOARD_URL/api/auth/sign-in/magic-link" \
  -H 'content-type: application/json' \
  -d '{"email":"dev@plinth.local","callbackURL":"/"}')"
[ "$magic_status" = "200" ] && ok "magic-link issuance" || bad "magic-link issuance (status $magic_status)"

echo
if [ "$fail" -gt 0 ]; then
  echo "smoke: $fail failed, $pass passed"
  exit 1
fi
echo "smoke: all $pass checks passed"
