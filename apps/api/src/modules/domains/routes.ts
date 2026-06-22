import { Hono } from "hono";
import type { AppBindings } from "../../context";

/**
 * HTTP surface for the custom-domains domain (add, verify, remove). Speaks Hono,
 * delegates to service, never touches db/adapter directly (ADR-0009). Endpoints
 * land with custom-domain wiring (ADR-0004).
 */
export const domainsRoutes = new Hono<AppBindings>();
