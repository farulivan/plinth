import { ok } from "@plinth/schema/api";
import { Hono } from "hono";
import type { AppBindings } from "../../context";
import { listMedia } from "./service";

/**
 * HTTP surface for the media domain. `GET /media` returns the workspace's media
 * (empty for now) inside the shared response envelope — every module route
 * speaks `{ok, data} | {ok: false, error}` so the dashboard handles failures
 * uniformly. Routes delegate to service and never touch db or adapter directly
 * (ADR-0009); the typed response is what the dashboard's RPC client infers from.
 */
export const mediaRoutes = new Hono<AppBindings>().get("/", (c) => c.json(ok(listMedia())));
