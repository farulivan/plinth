import { buildSite } from "./functions/buildSite";
import { inngest } from "./client";

/** Everything server.ts needs to mount the Inngest endpoint. */
export { inngest };
export const functions = [buildSite];
