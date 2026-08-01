#!/usr/bin/env node
// Asserts the dashboard's response-header contract (ADR-0011) against a running
// deployment. Built for CI's Images workflow, which boots the same image the
// Fly deploy ships, but it takes a URL so it works against local-prod or
// production too:
//
//   node scripts/assert-security-contract.mjs http://localhost:3000
//
// Why this exists as its own gate: the CSP carries a per-request nonce, and a
// route that is prerendered cannot carry one — its inline bootstrap scripts
// ship bare against a policy with no 'unsafe-inline' to fall back on, so they
// are blocked and the page never hydrates. Nothing about that is visible in a
// unit test, a typecheck, or a `next build` summary; it needs a real server
// answering a real request. The failure is also silent on any page that does
// not need to hydrate, which is exactly how it survives review.
//
// Kept dependency-free so it runs in a job that has not installed the
// workspace.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Routes that must render HTML and satisfy the nonce contract. `/login` is the
 * one that matters most: its form is entirely client-side, so a blocked
 * bootstrap means no sign-in at all.
 *
 * This is a fixed list, and that is the check's real limit — it covers the
 * HTML a signed-out caller can reach, so a newly prerendered route elsewhere
 * would slip past until someone adds it here. Everything behind the session is
 * unreachable without a database, which this job deliberately does not have.
 * Playwright covers the authed surface; this covers the surface Playwright
 * cannot see, because it runs against `next dev` rather than the shipped image.
 */
const HTML_ROUTES = ["/login", "/callback?error=expired", "/a-route-that-does-not-exist"];

/** Present on every response, including the static assets and API routes the
 * proxy's matcher skips — they ship from next.config, not the proxy. */
const REQUIRED_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

let failures = 0;
const ok = (message) => console.log(`  ok   ${message}`);
const bad = (message) => {
  console.log(`  FAIL ${message}`);
  failures += 1;
};

/** Inline <script> elements — those without a src attribute. */
function inlineScriptTags(html) {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/gi)].map((match) => match[1]);
}

function nonceFromCsp(csp) {
  const directive = (csp ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  return directive?.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

console.log(`security contract: ${base}`);

console.log("contract: html routes carry a usable nonce");
for (const route of HTML_ROUTES) {
  const response = await fetch(`${base}${route}`, {
    headers: { cookie: "better-auth.session_token=contract-probe" },
    redirect: "manual",
  });
  const html = await response.text();
  const nonce = nonceFromCsp(response.headers.get("content-security-policy"));

  if (!nonce) {
    bad(`${route} — no nonce in the Content-Security-Policy`);
    continue;
  }
  const inline = inlineScriptTags(html);
  if (inline.length === 0) {
    // No scripts to block, so the route is trivially safe under the policy.
    ok(`${route} — no inline scripts to nonce`);
    continue;
  }
  const bare = inline.filter((attrs) => !attrs.includes(`nonce="${nonce}"`));
  if (bare.length > 0) {
    bad(
      `${route} — ${bare.length}/${inline.length} inline scripts have no matching nonce ` +
        `(a prerendered route under the proxy's matcher? it cannot carry a per-request nonce)`,
    );
    continue;
  }
  ok(`${route} — ${inline.length} inline scripts nonced`);
}

console.log("contract: non-CSP headers on every response");
for (const route of ["/login", "/icon.svg"]) {
  const response = await fetch(`${base}${route}`, { redirect: "manual" });
  const missing = REQUIRED_HEADERS.filter((header) => !response.headers.has(header));
  if (missing.length > 0) bad(`${route} — missing ${missing.join(", ")}`);
  else ok(`${route} — all ${REQUIRED_HEADERS.length} present`);
}

console.log("contract: the sign-in page is reachable, not looping");
const login = await fetch(`${base}/login`, { redirect: "manual" });
if (login.status === 200) ok("/login → 200");
else
  bad(`/login → ${login.status} (expected 200; a redirect here is the loop the gate exists for)`);

console.log(failures === 0 ? "security contract: pass" : `security contract: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
