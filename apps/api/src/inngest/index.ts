import { buildSite } from "./functions/buildSite";
import { syncTenantHosts } from "./functions/syncTenantHosts";
import { inngest } from "./client";

/** Everything server.ts needs to mount the Inngest endpoint. */
export { inngest };
export const functions = [buildSite, syncTenantHosts];
