import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Per-tenant form allowance (ADR-0011). The edge composes a tenant's CSP from
 * a delta stored in KV rather than storing a finished policy per tenant, so
 * these cover both halves: a tenant with a form gets exactly the origin it
 * needs, and one without is untouched.
 *
 * Nothing here writes R2, deliberately. The pool's isolated-storage stack
 * cannot pop an R2 frame in this environment — it asserts every file under the
 * bucket directory ends in `.sqlite` and trips over SQLite's own `-shm`
 * sidecar — so a suite that seeds R2 fails after its first test with "unable
 * to pop R2 storage", naming a test that did nothing wrong. Every assertion
 * below rides the 404 path, which reads R2 and never writes it.
 */
const HOST = "norven.localhost";
const FORM_HOST = "withform.localhost";

const BASE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://*.r2.cloudflarestorage.com; font-src 'self' data:; " +
  "connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; " +
  "frame-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests";

const mapping = (formOrigins?: string[]) =>
  JSON.stringify({
    workspaceId: "ws-norven",
    versionNumber: 3,
    ...(formOrigins ? { formOrigins } : {}),
  });

beforeEach(async () => {
  await env.TENANT_HOSTS.put(HOST, mapping());
});

/** Any response for this host — a miss is enough, and it touches no R2 write. */
const cspFor = async (host: string): Promise<string> =>
  (await SELF.fetch(`https://${host}/`)).headers.get("content-security-policy")!;

describe("per-tenant form policy", () => {
  it("widens connect-src and form-action together for a tenant with a form", async () => {
    await env.TENANT_HOSTS.put(FORM_HOST, mapping(["https://api.web3forms.com"]));

    const csp = await cspFor(FORM_HOST);

    // Both, not one: connect-src covers the enhanced fetch and form-action the
    // native POST the page falls back to without JavaScript. Granting one
    // breaks exactly half the form, in whichever half nobody tested.
    expect(csp).toContain("connect-src 'self' https://api.web3forms.com");
    expect(csp).toContain("form-action 'self' https://api.web3forms.com");
    // And nothing else moves.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("leaves a tenant without a form on the base policy", async () => {
    const csp = await cspFor(HOST);

    expect(csp).toBe(BASE_CSP);
    expect(csp).not.toContain("web3forms");
  });

  // KV carries no schema of its own, so a bad write must not be able to widen
  // a tenant's policy to an arbitrary host.
  it("ignores an origin that is not on the allowlist", async () => {
    await env.TENANT_HOSTS.put(FORM_HOST, mapping(["https://evil.example"]));

    const csp = await cspFor(FORM_HOST);

    expect(csp).toBe(BASE_CSP);
    expect(csp).not.toContain("evil.example");
  });

  // The worker ships with no runtime dependencies, so it keeps its own copy of
  // the origin the schema package defines. A test may import what the bundle
  // may not, and this is the only thing stopping the two drifting into a form
  // rendered pointing at one host and permitted to reach another.
  it("agrees with the schema package about where a form posts", async () => {
    const { CONTACT_FORM_ENDPOINT, CONTACT_FORM_ORIGIN } = await import("@plinth/schema/content");
    await env.TENANT_HOSTS.put(FORM_HOST, mapping([CONTACT_FORM_ORIGIN]));

    expect(await cspFor(FORM_HOST)).toContain(`connect-src 'self' ${CONTACT_FORM_ORIGIN}`);
    expect(CONTACT_FORM_ENDPOINT.startsWith(CONTACT_FORM_ORIGIN)).toBe(true);
  });
});
