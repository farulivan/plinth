import type { Db } from "@plinth/db";
import { env } from "../../lib/env";
import { CONTACT_FORM_ORIGIN } from "@plinth/schema/content";
import { putTenantHostMapping } from "./adapter";
import { getPublishedSiteSettings, getWorkspaceSlug } from "./db";

/**
 * Business logic for the domains module. v1 maps one hostname per workspace —
 * `{slug}{TENANT_HOST_SUFFIX}` (norven.farulivan.com in production,
 * norven.localhost against wrangler dev). The custom-domains table joins this
 * fan-out post-v1 (ADR-0004); the sync shape stays the same.
 */

export function hostnameFor(slug: string): string {
  return `${slug}${env.TENANT_HOST_SUFFIX}`;
}

/** Push the workspace's freshly promoted version into the edge KV map. Called
 * by the Inngest sync function on every promote (ADR-0004 — with the trigger
 * point deviating from its Postgres-trigger wording: the promote step emits
 * the event directly, one moving part fewer, same eventual convergence). */
export async function syncWorkspaceHost(
  db: Db,
  input: { workspaceId: string; versionNumber: number },
): Promise<{ hostname: string; written: boolean }> {
  const slug = await getWorkspaceSlug(db, input.workspaceId);
  if (!slug) throw new Error(`Workspace ${input.workspaceId} no longer exists.`);

  // The published snapshot decides the tenant's form allowance, so the CSP
  // the edge serves describes what is actually being served (ADR-0011). Every
  // promote re-derives it, which is what makes removing a form close the hole
  // rather than leaving it open until someone notices.
  const site = await getPublishedSiteSettings(db, input.workspaceId, input.versionNumber);
  const formOrigins = site?.contactFormKey ? [CONTACT_FORM_ORIGIN] : undefined;

  const hostname = hostnameFor(slug);
  const { written } = await putTenantHostMapping(hostname, {
    workspaceId: input.workspaceId,
    versionNumber: input.versionNumber,
    ...(formOrigins ? { formOrigins } : {}),
  });
  return { hostname, written };
}
