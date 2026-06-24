import "server-only";
import type { AppType } from "@plinth/api/app";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "@plinth/api/hmac";
import { hc } from "hono/client";
import { env } from "@/lib/env";

/**
 * Type-safe RPC client for the api (ADR-0008). `hc<AppType>` infers every route
 * from the api's exported app type, so renaming a route or its schema breaks
 * this call site at typecheck — the contract is the build, not a doc.
 *
 * Server-only: each request is signed with the shared INTERNAL_API_HMAC_SECRET
 * (the same canonical string the api's internalHmac verifies), so this must
 * never run in the browser. Per-request session forwarding (the caller's cookie)
 * is layered on at call sites once authed endpoints exist.
 */
export const api = hc<AppType>(env.INTERNAL_API_URL, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const timestamp = Date.now().toString();
    const body = request.body ? await request.clone().text() : "";
    const signature = sign(
      env.INTERNAL_API_HMAC_SECRET,
      timestamp,
      request.method,
      new URL(request.url).pathname,
      body,
    );
    request.headers.set(TIMESTAMP_HEADER, timestamp);
    request.headers.set(SIGNATURE_HEADER, signature);
    return fetch(request);
  },
});
