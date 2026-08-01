import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createAuthGate, safeReturnPath } from "./next";

const gate = createAuthGate({ protectedPaths: ["/"] });

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(
    `https://plinth.example.com${path}`,
    cookie ? { headers: { cookie } } : {},
  );
}

/** A NextResponse.redirect carries a Location header; a pass-through does not. */
function isRedirectToLogin(res: { headers: Headers }): boolean {
  return (res.headers.get("location") ?? "").includes("/login");
}

describe("createAuthGate", () => {
  it("passes a request carrying the production __Secure- session cookie", () => {
    const res = gate(request("/", "__Secure-better-auth.session_token=abc"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("passes the plain (dev/HTTP) session cookie", () => {
    const res = gate(request("/", "better-auth.session_token=abc"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("redirects to login when no session cookie is present", () => {
    const res = gate(request("/"));
    expect(isRedirectToLogin(res)).toBe(true);
  });

  // Previously asserted against `protectedPaths: ["/"]`, where it only passed
  // because the root prefix matched nothing below it. Under a narrower prefix
  // it tests what its name claims; the "everything is protected" arrangement
  // the dashboard actually uses is covered by the publicPaths suite below.
  it("leaves unprotected paths alone", () => {
    const scoped = createAuthGate({ protectedPaths: ["/studio"] });
    expect(isRedirectToLogin(scoped(request("/login")))).toBe(false);
    expect(isRedirectToLogin(scoped(request("/studio")))).toBe(true);
  });
});

describe("createAuthGate with publicPaths", () => {
  // The dashboard's real shape: everything is protected, so the auth pages can
  // only stay inside the matcher (and thus keep their response headers) by
  // being declared public.
  const publicGate = createAuthGate({
    protectedPaths: ["/"],
    publicPaths: ["/login", "/callback"],
  });

  it("lets an unauthenticated request reach a public path instead of looping", () => {
    for (const path of ["/login", "/callback"]) {
      expect(isRedirectToLogin(publicGate(request(path)))).toBe(false);
    }
  });

  it("treats a public prefix's children as public too", () => {
    expect(isRedirectToLogin(publicGate(request("/callback/error")))).toBe(false);
  });

  it("still redirects an unauthenticated request to a protected path", () => {
    expect(isRedirectToLogin(publicGate(request("/media")))).toBe(true);
  });

  it("does not treat a path that merely starts with the same characters as public", () => {
    expect(isRedirectToLogin(publicGate(request("/logins-report")))).toBe(true);
  });

  // Regression: `protectedPaths: ["/"]` used to gate the root and nothing
  // under it, so nested routes fell through to the Server Component's own
  // redirect — a full RSC render and session lookup instead of the cheap edge
  // bounce, and the `next` return-path was lost.
  it("gates paths nested under the root prefix, carrying the return path", () => {
    for (const path of ["/media", "/preview/abc"]) {
      const res = publicGate(request(path));
      expect(isRedirectToLogin(res)).toBe(true);
      expect(res.headers.get("location")).toContain(`next=${encodeURIComponent(path)}`);
    }
  });

  it("forwards headers on a public path, so the CSP nonce still reaches the render", () => {
    const forwarded = new Headers({ "x-nonce": "abc" });
    const res = publicGate(request("/login"), forwarded);
    expect(res.headers.get("x-middleware-override-headers")).toContain("x-nonce");
  });
});

describe("safeReturnPath", () => {
  it("keeps a local path, with its query and fragment", () => {
    expect(safeReturnPath("/media")).toBe("/media");
    expect(safeReturnPath("/preview/abc?tab=fields")).toBe("/preview/abc?tab=fields");
    expect(safeReturnPath("/media#latest")).toBe("/media#latest");
  });

  it("falls back to the root when there is nothing to return to", () => {
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });

  // The value reaches Better Auth as callbackURL — where the browser lands
  // after a real sign-in — so an off-origin value is an open redirect with
  // authentication attached, not just a bad link.
  it("refuses anything that would leave this origin", () => {
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "//evil.example/media",
      "/\\evil.example",
      "http://evil.example/media",
      "javascript:alert(1)",
      "media",
    ]) {
      expect(safeReturnPath(hostile), hostile).toBe("/");
    }
  });

  it("strips an authority smuggled past the leading slash", () => {
    // Resolving against a base we control means these can only ever be paths.
    expect(safeReturnPath("/@evil.example")).toBe("/@evil.example");
    expect(safeReturnPath("/../etc")).toBe("/etc");
  });
});
