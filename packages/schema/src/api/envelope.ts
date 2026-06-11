import { z } from "zod";
import { apiError, type ApiError, type ApiErrorCode } from "./errors";

/**
 * The one response shape both transports speak — Hono RPC routes and Next
 * Server Actions. Hono RPC infers the static types across the wire; this
 * envelope is the runtime discriminant (`ok`) plus the uniform error shape,
 * so dashboard code handles failures identically regardless of source.
 */
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: ApiError };
export type Envelope<T> = Ok<T> | Err;

/** Success constructor — plain function, no Response/transport coupling. */
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

/** Failure constructor. Routes map `code` to HTTP via ERROR_STATUS. */
export function err(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: ApiError["fieldErrors"],
): Err {
  return { ok: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } };
}

/** Runtime schema for an envelope, for boundaries that parse rather than
 * infer (tests, webhook payloads, anything crossing a non-RPC edge). */
export function envelope<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: apiError }),
  ]);
}
