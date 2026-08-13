#!/usr/bin/env bash
# Parity check for a tenant host, run against the live site before and after
# the DNS flip.
#
# Everything here is a property the standalone Norven site had and the Plinth
# build must still have. It is deliberately a shell script hitting a real URL
# rather than a test against a build directory: the questions it answers —
# does the route exist, does the header survive Cloudflare, does the redirect
# land — are questions about the deployed system, and a green CI run cannot
# answer any of them.
#
#   ./scripts/verify-cutover.sh norven.farulivan.com
#
# Exits non-zero on the first failure, so it is usable as a gate.

set -euo pipefail

HOST="${1:-norven.farulivan.com}"
# https in production; SCHEME=http lets the same script run against
# `wrangler dev` before the flip, so it is exercised rather than assumed.
BASE="${SCHEME:-https}://${HOST}"
fails=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m✗\033[0m %s\n' "$1"
  fails=$((fails + 1))
}
# Not a pass and not a failure: a check that cannot be meaningful here. Kept
# visible rather than silently dropped, so the reason stays in front of you.
skip() { printf '  \033[33m–\033[0m %s\n' "$1"; }

# Cache-busting: an intermediate cache answering with a stale object would
# make a missing route look present.
bust() { echo "$1?$(date +%s)"; }

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "Routes — every page the site publishes"
for path in / /projects/ /projects/salt-house/ /projects/obsidian-pavilion/ \
  /projects/terra-works/ /projects/holm-chapel/ /projects/nord-strata-tower/ \
  /studio/ /contact/ /colophon/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$(bust "${BASE}${path}")")
  [ "$code" = "200" ] && pass "200 ${path}" || fail "${code} ${path} (expected 200)"
done

say "404 — a miss renders the tenant's own page, not the platform's"
body=$(curl -s "$(bust "${BASE}/no-such-page/")")
code=$(curl -s -o /dev/null -w '%{http_code}' "$(bust "${BASE}/no-such-page/")")
[ "$code" = "404" ] && pass "404 status" || fail "status ${code} (expected 404)"
case "$body" in
*"Site not found"*) fail "served the platform's plain-text 404, not the tenant's page" ;;
*"<html"*) pass "tenant's own 404 page" ;;
*) fail "404 body is neither the tenant page nor the platform fallback" ;;
esac

say "Discovery"
robots=$(curl -s "$(bust "${BASE}/robots.txt")")
case "$robots" in
*"sitemap-index.xml"*) pass "robots.txt points at the sitemap index" ;;
*) fail "robots.txt does not reference sitemap-index.xml" ;;
esac
for f in /sitemap-index.xml /sitemap-0.xml; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$(bust "${BASE}${f}")")
  [ "$code" = "200" ] && pass "200 ${f}" || fail "${code} ${f}"
done
# The sitemap must list the real host, not the build's fallback.
expected_origin="${SITE_URL:-https://${HOST}}"
curl -s "$(bust "${BASE}/sitemap-0.xml")" | grep -q "${expected_origin}/" &&
  pass "sitemap URLs carry ${expected_origin}" || fail "sitemap URLs do not carry ${expected_origin}"

say "Head — canonical, Open Graph, structured data"
home=$(curl -s "$(bust "${BASE}/")")
echo "$home" | grep -q "rel=\"canonical\" href=\"${SITE_URL:-https://${HOST}}/\"" &&
  pass "canonical is absolute and on this host" || fail "canonical missing or wrong host"
echo "$home" | grep -q 'property="og:image"' && pass "og:image present" || fail "og:image missing"
echo "$home" | grep -q '"@type":"Organization"' &&
  pass "Organization JSON-LD" || fail "Organization JSON-LD missing"
curl -s "$(bust "${BASE}/projects/salt-house/")" | grep -q '"@type":"CreativeWork"' &&
  pass "CreativeWork JSON-LD on a project" || fail "CreativeWork JSON-LD missing"

say "Response headers — the contract the worker sets, as Cloudflare delivers it"
headers=$(curl -sI "$(bust "${BASE}/")")
for header in content-security-policy x-content-type-options x-frame-options \
  referrer-policy permissions-policy cross-origin-opener-policy \
  cross-origin-resource-policy; do
  echo "$headers" | grep -qi "^${header}:" && pass "$header" || fail "$header missing"
done
# HSTS comes from the Cloudflare zone, not from the worker (ADR-0011), so it
# only exists once a request actually passes through Cloudflare. Under
# `wrangler dev` there is no zone in front and it can never appear — asserting
# it there would report a failure nobody can fix, which is how a check becomes
# noise you learn to scroll past.
#
# Exactly once when it does apply: a second copy means the worker is emitting
# it as well as the zone, and browsers honour the first. That is a real and
# silent misconfiguration, which is why this is checked at all.
if [ "${SCHEME:-https}" = "https" ]; then
  hsts=$(echo "$headers" | grep -ci '^strict-transport-security:' || true)
  [ "$hsts" = "1" ] && pass "strict-transport-security exactly once" ||
    fail "strict-transport-security appears ${hsts} times (expected 1)"
else
  skip "strict-transport-security — set by the Cloudflare zone, absent under wrangler dev"
fi

say "Contact form — rendered, and permitted by the policy"
contact=$(curl -s "$(bust "${BASE}/contact/")")
echo "$contact" | grep -q 'action="https://api.web3forms.com/submit"' &&
  pass "form posts to the delivery endpoint" || fail "no form, or it posts elsewhere"
echo "$contact" | grep -q 'name="access_key"' &&
  pass "access key present" || fail "access key missing — submissions would be lost"
csp=$(curl -sI "$(bust "${BASE}/contact/")" | grep -i '^content-security-policy:')
case "$csp" in
*"connect-src 'self' https://api.web3forms.com"*) pass "connect-src allows the endpoint" ;;
*) fail "connect-src does not allow the endpoint — the enhanced submit is blocked" ;;
esac
case "$csp" in
*"form-action 'self' https://api.web3forms.com"*) pass "form-action allows the endpoint" ;;
*) fail "form-action does not allow the endpoint — the no-JS submit is blocked" ;;
esac

say "Caching — hashed assets immutable, stable paths revalidating"
asset=$(echo "$home" | grep -o '/_astro/[^"]*\.css' | head -1)
if [ -n "$asset" ]; then
  curl -sI "${BASE}${asset}" | grep -qi 'cache-control:.*immutable' &&
    pass "hashed asset is immutable" || fail "hashed asset is not immutable"
else
  fail "no /_astro/ stylesheet found to check"
fi
curl -sI "$(bust "${BASE}/robots.txt")" | grep -qi 'cache-control:.*must-revalidate' &&
  pass "robots.txt revalidates" || fail "robots.txt is not revalidating — it would pin at the edge"

printf '\n'
if [ "$fails" -eq 0 ]; then
  printf '\033[32mAll checks passed for %s\033[0m\n' "$HOST"
else
  printf '\033[31m%s check(s) failed for %s\033[0m\n' "$fails" "$HOST"
  exit 1
fi
