import { env } from "../../lib/env";

/**
 * External boundary of the domains module: the Cloudflare KV namespace the
 * worker-router reads (`hostname → {workspaceId, versionNumber}`, ADR-0004).
 * Pure vendor calls — never imports service or db (ADR-0009).
 */

export interface TenantHostMapping {
  workspaceId: string;
  versionNumber: number;
  /** Origins this tenant's pages may post a form to. Absent for the great
   * majority of tenants, which have no form; the worker composes its CSP from
   * this rather than storing a whole policy per tenant (ADR-0011). */
  formOrigins?: string[];
}

/**
 * Writes one hostname mapping via Cloudflare's REST API. Local dev has no
 * Cloudflare credentials — the wrangler-simulated KV is seeded by
 * `pnpm worker:sync` instead — so absent credentials mean "skip, honestly",
 * not "fail the promote".
 */
export async function putTenantHostMapping(
  hostname: string,
  mapping: TenantHostMapping,
): Promise<{ written: boolean }> {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID } = env;
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID) {
    console.warn(
      `[domains] KV sync skipped for ${hostname} — no Cloudflare credentials (local dev uses pnpm worker:sync).`,
    );
    return { written: false };
  }

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}` +
    `/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}/values/${encodeURIComponent(hostname)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(mapping),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare KV put for ${hostname} failed: ${response.status}`);
  }
  return { written: true };
}
