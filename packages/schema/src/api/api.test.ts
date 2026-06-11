import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { apiErrorCode, type Envelope, ERROR_STATUS, envelope, err, ok } from "./index";

describe("error vocabulary", () => {
  it("every code maps to an HTTP status", () => {
    for (const code of apiErrorCode.options) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("envelope", () => {
  const media = z.object({ id: z.uuid() });
  const schema = envelope(media);
  const UUID = "8c7a3c3e-2f6b-4e7a-9f7e-2b1a4d5e6f70";

  it("ok() round-trips through the runtime schema", () => {
    const parsed = schema.parse(ok({ id: UUID }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.id).toBe(UUID);
  });

  it("err() carries code, message, and optional field errors", () => {
    const parsed = schema.parse(
      err("validation_failed", "title required", { "fields.title": ["required"] }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(ERROR_STATUS[parsed.error.code]).toBe(422);
      expect(parsed.error.fieldErrors?.["fields.title"]).toEqual(["required"]);
    }
  });

  it("rejects malformed envelopes", () => {
    expect(schema.safeParse({ ok: true }).success).toBe(false);
    expect(schema.safeParse({ ok: false, error: { code: "nope", message: "x" } }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ok: false, error: { code: "internal" } }).success).toBe(false);
  });

  it("narrows on the discriminant at the type level", () => {
    // Function boundary keeps the declared union type — a direct const
    // assignment would let control-flow analysis collapse the else to never.
    const roundTrip = (e: Envelope<{ id: string }>): Envelope<{ id: string }> => e;
    const e = roundTrip(ok({ id: UUID }));
    if (e.ok) {
      expectTypeOf(e.data).toEqualTypeOf<{ id: string }>();
    } else {
      expectTypeOf(e.error.code).toEqualTypeOf<
        | "validation_failed"
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "conflict"
        | "rate_limited"
        | "payload_too_large"
        | "internal"
      >();
    }
  });
});
