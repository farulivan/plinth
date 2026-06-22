import { Hono } from "hono";
import type { AppBindings } from "../../context";

/**
 * HTTP surface for the publish domain (trigger a build, report status). Speaks
 * Hono, delegates to service, never touches db/adapter directly (ADR-0009).
 * Endpoints land with the publish pipeline (ADR-0003).
 */
export const publishRoutes = new Hono<AppBindings>();
