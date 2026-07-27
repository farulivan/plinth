import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createAuthGate } from "./next";

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

  it("leaves unprotected paths alone", () => {
    const res = gate(request("/login"));
    expect(isRedirectToLogin(res)).toBe(false);
  });
});
