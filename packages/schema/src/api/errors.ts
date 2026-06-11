import { z } from "zod";

/** Machine-readable error codes — the full failure vocabulary of the api
 * surface. UI copy keys off these; messages are for developers and logs. */
export const apiErrorCode = z.enum([
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCode>;

/** HTTP status each code maps to — routes attach it, services never see HTTP. */
export const ERROR_STATUS = {
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  internal: 500,
} as const satisfies Record<ApiErrorCode, number>;

/** Per-field validation messages, keyed by dotted path ("sections.0.fields.title").
 * The editor surfaces these inline in the form — never inside the preview
 * iframe (ADR-0007: only the form can act on errors). */
export const fieldErrors = z.record(z.string(), z.array(z.string()).min(1));
export type FieldErrors = z.infer<typeof fieldErrors>;

export const apiError = z.object({
  code: apiErrorCode,
  message: z.string().min(1),
  fieldErrors: fieldErrors.optional(),
});
export type ApiError = z.infer<typeof apiError>;
