import { Hono } from "hono";
import type { AppBindings } from "../../context";
import { listMedia } from "./service";

/**
 * HTTP surface for the media domain. `GET /media` returns the workspace's media
 * (empty for now). Routes delegate to service and never touch db or adapter
 * directly (ADR-0009); the typed response is what the dashboard's RPC client
 * infers from.
 */
export const mediaRoutes = new Hono<AppBindings>().get("/", (c) => c.json(listMedia()));
