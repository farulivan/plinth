import "server-only";
import type { AppType } from "@plinth/api/app";
import { SIGNATURE_HEADER, sign, TIMESTAMP_HEADER } from "@plinth/internal-rpc";
import { hc } from "hono/client";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Type-safe RPC client for the api (ADR-0008). `hc<AppType>` infers every route
 * from the api's exported app type, so renaming a route or its schema breaks
 * this call site at typecheck — the contract is the build, not a doc.
 *
 * Server-only: each request is signed with the shared INTERNAL_API_HMAC_SECRET
 * (the same canonical string the api's internalHmac verifies), so this must
 * never run in the browser. The caller's cookies are forwarded per request, so
 * the api resolves the same user session the dashboard request carries — the
 * HMAC authenticates the service, the session authenticates the person.
 */
export const api = hc<AppType>(env.INTERNAL_API_URL, {
  fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    try {
      const cookie = (await headers()).get("cookie");
      if (cookie) request.headers.set("cookie", cookie);
    } catch {
      // Outside a request scope (build-time module evaluation) — nothing to
      // forward; the api will answer with the 401 envelope if a route needs
      // a session.
    }
    const timestamp = Date.now().toString();
    const body = request.body ? await request.clone().text() : "";
    const url = new URL(request.url);
    const signature = sign(
      env.INTERNAL_API_HMAC_SECRET,
      timestamp,
      request.method,
      url.pathname + url.search,
      body,
    );
    request.headers.set(TIMESTAMP_HEADER, timestamp);
    request.headers.set(SIGNATURE_HEADER, signature);
    return fetch(request);
  },
});
