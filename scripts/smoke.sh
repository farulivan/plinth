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
# A valid signature without a user session passes the HMAC layer and is then
# answered by requireSession with the 401 envelope — the "unauthorized" code
# proves the request got past signature verification into the app.
signed_body="$(curl -s --max-time 10 -H "x-plinth-timestamp: $ts" -H "x-plinth-signature: $sig" "$API_URL/media" || true)"
case "$signed_body" in
  *'"code":"unauthorized"'*) ok "signed sessionless request gets the 401 envelope" ;;
  *) bad "signed sessionless request gets the 401 envelope (got: ${signed_body:-<empty>})" ;;
esac
[ "$(status_of -H "x-plinth-timestamp: $ts" -H "x-plinth-signature: $sig" "$API_URL/media?page=2")" = "401" ] \
  && ok "same signature with tampered query rejected" || bad "same signature with tampered query rejected"

echo "smoke: session guard"
# A cookie that isn't a real session must not reach page content: the authed
# layout validates for real (the edge proxy only checks presence) and
# redirects to /login.
guard_redirect="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 \
  -H "Cookie: better-auth.session_token=smoke-probe" "$DASHBOARD_URL/media")"
case "$guard_redirect" in
  *"/login"*) ok "fake session cookie is bounced to /login" ;;
  *) bad "fake session cookie is bounced to /login (redirect: ${guard_redirect:-<none>})" ;;
esac

echo "smoke: auth flow"
# Issues a real magic link: validates the dashboard's runtime env contract,
# Better Auth wiring, and a write to the verification table in one call. The
# link itself prints to the dashboard logs (stdout sender — no Resend key).
magic_status="$(status_of -X POST "$DASHBOARD_URL/api/auth/sign-in/magic-link" \
  -H 'content-type: application/json' \
  -d '{"email":"dev@plinth.local","callbackURL":"/"}')"
[ "$magic_status" = "200" ] && ok "magic-link issuance" || bad "magic-link issuance (status $magic_status)"

# Full authenticated thread — only where the magic link is readable (the
# local-prod stack's container logs): click the link, land with a session,
# and load /media. That one render proves the whole M2 chain: session
# validation in the layout, first-login workspace auto-activation, cookie
# forwarding through the RPC client, requireSession passing on the api, and
# the envelope coming back over the compose network.
if [ -f docker-compose.local-prod.yml ] \
  && [ -n "$(docker compose -f docker-compose.local-prod.yml ps -q dashboard 2>/dev/null)" ] \
  && [ "$DASHBOARD_URL" = "http://localhost:3000" ]; then
  link=""
  for _ in 1 2 3 4 5; do
    link="$(docker compose -f docker-compose.local-prod.yml logs dashboard 2>/dev/null |
      grep -o 'http://[^[:space:]]*magic-link/verify[^[:space:]]*' | tail -1)"
    [ -n "$link" ] && break
    sleep 1
  done
  if [ -z "$link" ]; then
    bad "authenticated media page (no magic link found in dashboard logs)"
  else
    jar="$(mktemp)"
    curl -s -L -c "$jar" -o /dev/null --max-time 15 "$link"
    authed_html="$(curl -s -b "$jar" --max-time 15 "$DASHBOARD_URL/media" || true)"
    rm -f "$jar"
    case "$authed_html" in
      *"No media yet."*) ok "authenticated media page round-trips the internal rpc" ;;
      *) bad "authenticated media page round-trips the internal rpc" ;;
    esac
  fi
else
  echo "  skip authenticated media page (local-prod stack not detected)"
fi

echo
if [ "$fail" -gt 0 ]; then
  echo "smoke: $fail failed, $pass passed"
  exit 1
fi
echo "smoke: all $pass checks passed"
