import { getSession } from "@plinth/auth";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "@plinth/internal-rpc";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { auth } from "@/server/auth";

// Streams per-request; never prerendered.
export const dynamic = "force-dynamic";

/**
 * Preview-side media proxy (ADR-0014): the renderer emits the same
 * `/_media/{contentHash}/w{width}.{format}` paths everywhere — on a published
 * site the worker-router resolves them; inside the dashboard (preview iframe,
 * editor thumbnails, media library) this handler does, by piping the api's
 * authenticated variant stream. The api scopes the lookup to the caller's
 * active workspace, so a foreign hash 404s.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ contentHash: string; variant: string }> },
): Promise<Response> {
  const { contentHash, variant } = await ctx.params;

  const session = await getSession({ auth, headers: await headers() });
  if (!session) return new Response(null, { status: 401 });

  const path = `/media/file/${encodeURIComponent(contentHash)}/${encodeURIComponent(variant)}`;
  const timestamp = Date.now().toString();
  const upstreamHeaders = new Headers({
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: sign(env.INTERNAL_API_HMAC_SECRET, timestamp, "GET", path, ""),
  });
  const cookie = request.headers.get("cookie");
  if (cookie) upstreamHeaders.set("cookie", cookie);

  const upstream = await fetch(new URL(path, env.INTERNAL_API_URL), {
    headers: upstreamHeaders,
    cache: "no-store",
    signal: request.signal,
  });
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
