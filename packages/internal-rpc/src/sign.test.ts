import { describe, expect, it } from "vitest";
import { sign } from "./index";

// Deliberately wordy fixture: high-entropy strings trip the secret scanner.
const SECRET = "test-internal-rpc-secret-32-char";
const TS = "1750000000000";

describe("sign", () => {
  it("is deterministic for identical inputs", () => {
    const a = sign(SECRET, TS, "GET", "/media", "");
    const b = sign(SECRET, TS, "GET", "/media", "");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("covers the query string", () => {
    const bare = sign(SECRET, TS, "GET", "/media", "");
    const paged = sign(SECRET, TS, "GET", "/media?page=2", "");
    expect(paged).not.toBe(bare);
  });

  it("does not collide when a path suffix is re-sliced into the body", () => {
    // With a delimiter that can occur inside fields (the old "."), these two
    // produced one canonical string: "/media/x.y" + "" vs "/media/x" + "y.".
    const original = sign(SECRET, TS, "POST", "/media/x.y", "");
    const resliced = sign(SECRET, TS, "POST", "/media/x", "y.");
    expect(resliced).not.toBe(original);
  });

  it("changes with the secret", () => {
    const a = sign(SECRET, TS, "GET", "/media", "");
    const b = sign("another-secret-another-secret-32", TS, "GET", "/media", "");
    expect(a).not.toBe(b);
  });
});
