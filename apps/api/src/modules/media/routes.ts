import { Hono } from "hono";
import type { AppBindings } from "../../context";

/**
 * HTTP surface for the media domain (uploads, listing, transform requests).
 * Routes are the only layer that speaks Hono; they delegate to service and never
 * touch db or adapter directly (ADR-0009). Endpoints land with the media
 * pipeline — `media.list` arrives in Branch 12 to prove the RPC type flow.
 */
export const mediaRoutes = new Hono<AppBindings>();
