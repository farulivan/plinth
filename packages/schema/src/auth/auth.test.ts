import { describe, expect, expectTypeOf, it } from "vitest";
import {
  appSession,
  type AppSession,
  email,
  loginRequest,
  MAGIC_LINK_RATE_LIMIT,
  MAGIC_LINK_TTL_MINUTES,
  magicLinkToken,
  workspaceRole,
} from "./index";

const UUID = "8c7a3c3e-2f6b-4e7a-9f7e-2b1a4d5e6f70";

describe("email", () => {
  it("normalizes before validating format", () => {
    expect(email.parse("  Dev@Plinth.LOCAL ")).toBe("dev@plinth.local");
  });

  it("rejects non-addresses and oversized input", () => {
    expect(email.safeParse("not-an-email").success).toBe(false);
    expect(email.safeParse(`${"a".repeat(250)}@x.io`).success).toBe(false);
    expect(loginRequest.safeParse({}).success).toBe(false);
  });
});

describe("magic-link protocol", () => {
  it("pins the ADR-0005 constants", () => {
    expect(MAGIC_LINK_TTL_MINUTES).toBe(15);
    expect(MAGIC_LINK_RATE_LIMIT).toEqual({ perWindow: 5, windowMinutes: 15, perDay: 20 });
  });

  it("token is opaque with a length floor", () => {
    expect(magicLinkToken.safeParse("short").success).toBe(false);
    expect(magicLinkToken.parse("t".repeat(32))).toHaveLength(32);
  });
});

describe("session contract", () => {
  it("accepts a fresh user with no workspace", () => {
    const s = appSession.parse({
      sessionId: UUID,
      user: { id: UUID, email: "dev@plinth.local" },
      activeWorkspaceId: null,
    });
    expect(s.activeWorkspaceId).toBeNull();
    expect(s.sessionId).toBe(UUID);
  });

  it("normalizes the nested email too", () => {
    const s = appSession.parse({
      sessionId: UUID,
      user: { id: UUID, email: "Dev@PLINTH.local" },
      activeWorkspaceId: UUID,
    });
    expect(s.user.email).toBe("dev@plinth.local");
  });

  it("roles are a closed set", () => {
    expect(workspaceRole.parse("owner")).toBe("owner");
    expect(workspaceRole.safeParse("admin").success).toBe(false);
  });

  it("infers the GUC-bridge contract", () => {
    expectTypeOf<AppSession["activeWorkspaceId"]>().toEqualTypeOf<string | null>();
  });
});
