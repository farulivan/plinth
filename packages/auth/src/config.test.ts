import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSender } from "./email";
import { googleProvider } from "./plugins/google";
import { withSessionWorkspace } from "./session";
import type { Db } from "@plinth/db";

describe("googleProvider", () => {
  it("returns nothing when either credential is missing", () => {
    expect(googleProvider({})).toEqual({});
    expect(googleProvider({ clientId: "x" })).toEqual({});
    expect(googleProvider({ clientSecret: "y" })).toEqual({});
  });

  it("returns the provider when both are present", () => {
    expect(googleProvider({ clientId: "x", clientSecret: "y" })).toEqual({
      google: { clientId: "x", clientSecret: "y" },
    });
  });
});

describe("createEmailSender", () => {
  afterEach(() => vi.restoreAllMocks());

  it("falls back to stdout when no Resend key, printing the URL", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sender = createEmailSender();
    await sender.sendMagicLink({ to: "a@plinth.test", url: "https://x/verify?token=abc" });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]![0]).toContain("https://x/verify?token=abc");
  });

  it("falls back to stdout when the key is set but the from address is not", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sender = createEmailSender({ resendApiKey: "re_x" });
    await sender.sendMagicLink({ to: "a@plinth.test", url: "https://x/v" });
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("withSessionWorkspace", () => {
  it("throws before touching the db when no workspace is active", async () => {
    const ran = vi.fn();
    await expect(
      withSessionWorkspace(
        null as unknown as Db,
        {
          sessionId: crypto.randomUUID(),
          user: { id: crypto.randomUUID(), email: "a@plinth.test", name: null },
          activeWorkspaceId: null,
        },
        async () => {
          ran();
          return 1;
        },
      ),
    ).rejects.toThrow(/No active workspace/);
    expect(ran).not.toHaveBeenCalled();
  });
});
