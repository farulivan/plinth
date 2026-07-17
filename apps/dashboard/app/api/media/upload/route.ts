import { getSession } from "@plinth/auth";
import {
  BODY_HASH_HEADER,
  hashBody,
  SIGNATURE_HEADER,
  sign,
  TIMESTAMP_HEADER,
} from "@plinth/internal-rpc";
import { err } from "@plinth/schema/api";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { auth } from "@/server/auth";

/**
 * Upload forwarder (ADR-0006): the editor posts multipart here (the browser
 * side of the trip), this handler extracts the file and forwards its RAW
 * bytes to the api, signed with the HMAC body-hash variant. No multipart on
 * the internal leg on purpose: the signed digest is then exactly the file's
 * content hash, and the multipart parser stays out of the trust path (it
 * also chokes when the HMAC middleware has already consumed the body). A
 * route handler rather than a Server Action because actions buffer through
 * the RSC transport with a small body budget; files don't belong there.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getSession({ auth, headers: await headers() });
  if (!session) {
    return Response.json(err("unauthorized", "Sign in to upload."), { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json(err("validation_failed", 'Expected a multipart "file" field.'), {
      status: 422,
    });
  }

  const body = await file.arrayBuffer();
  const path = "/media/upload";
  const timestamp = Date.now().toString();
  const digest = hashBody(body);

  const upstreamHeaders = new Headers({
    "content-type": "application/octet-stream",
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: sign(env.INTERNAL_API_HMAC_SECRET, timestamp, "POST", path, digest),
    [BODY_HASH_HEADER]: digest,
  });
  const cookie = request.headers.get("cookie");
  if (cookie) upstreamHeaders.set("cookie", cookie);

  const upstream = await fetch(new URL(path, env.INTERNAL_API_URL), {
    method: "POST",
    headers: upstreamHeaders,
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
