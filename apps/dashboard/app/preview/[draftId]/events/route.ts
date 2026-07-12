import { getSession } from "@plinth/auth";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "@plinth/internal-rpc";
import { headers } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import { auth } from "@/server/auth";

// A live stream can never be prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * Same-origin SSE proxy (ADR-0012): the preview iframe's EventSource connects
 * here, and this handler pipes the api's stream through untouched. The api
 * stays browser-free — no CORS, no public exposure — because the upstream leg
 * is HMAC-signed like every internal call and carries the caller's cookie, so
 * the api applies its normal session + RLS checks before subscribing.
 */
export async function GET(request: Request, ctx: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await ctx.params;
  if (!z.uuid().safeParse(draftId).success) return new Response(null, { status: 404 });

  const session = await getSession({ auth, headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const path = `/draft-events/${draftId}`;
  const timestamp = Date.now().toString();
  const upstreamHeaders = new Headers({
    accept: "text/event-stream",
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: sign(env.INTERNAL_API_HMAC_SECRET, timestamp, "GET", path, ""),
  });
  const cookie = request.headers.get("cookie");
  if (cookie) upstreamHeaders.set("cookie", cookie);
  // EventSource reconnects announce the last seen event — pass it through so
  // the api replays what the drop missed.
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) upstreamHeaders.set("last-event-id", lastEventId);

  const upstream = await fetch(new URL(path, env.INTERNAL_API_URL), {
    headers: upstreamHeaders,
    cache: "no-store",
    signal: request.signal, // browser gone → tear down the api subscription
  });
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
