import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "node:path";

/**
 * The non-CSP half of the dashboard's header posture (ADR-0011). These ship
 * from the app rather than as Cloudflare Transform Rules: an edge rule is
 * invisible to the repo, untestable in CI, and silently absent everywhere the
 * edge isn't — `pnpm dev`, `pnpm local-prod`, and the Playwright run all speak
 * to an origin directly. Emitting them here means one definition covers every
 * environment and a reviewer can see the policy in the diff.
 *
 * Set in next.config rather than in proxy.ts because these apply to every
 * response, including the static assets and API routes the proxy's matcher
 * skips. The CSP stays in the proxy — it needs the per-request nonce.
 */
const SECURITY_HEADERS = [
  // A year, matching the floor the preload list requires. `preload` itself is
  // deliberately absent: it is a submission to a browser-shipped list that is
  // slow and painful to leave, so it stays an explicit operator decision
  // rather than something a config change makes for them.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny the entire powerful-feature surface; the dashboard asks for none of
  // it. Adding a feature means adding it here, which is the point.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  // Magic-link sign-in is a redirect flow, so nothing here opens a
  // cross-origin popup and needs `window.opener`. Shipping OAuth through a
  // popup would mean relaxing this to `same-origin-allow-popups`.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
  // Self-contained server bundle for Docker — Next copies a minimal traced
  // node_modules so the runtime image stays small.
  output: "standalone",
  // Trace from the monorepo root so workspace deps land in the standalone output.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Workspace packages ship as TS source, so Next must transpile the ones the
  // dashboard imports at runtime. @plinth/api is deliberately absent: only
  // `import type { AppType }` crosses that boundary, and type imports are
  // erased before bundling.
  transpilePackages: [
    "@plinth/auth",
    "@plinth/db",
    "@plinth/internal-rpc",
    "@plinth/renderer",
    "@plinth/schema",
    "@plinth/template-norven",
    "@plinth/ui",
  ],
};

export default withSentryConfig(nextConfig, {
  org: "farul-ivan",
  project: "plinth-dashboard",
  // Source-map upload runs only when SENTRY_AUTH_TOKEN is present (CI/prod);
  // absent locally, so dev builds skip it.
});
