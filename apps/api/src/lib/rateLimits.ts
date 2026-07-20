/**
 * Per-workspace rate caps (ADR-0003, ADR-0006): a policy decision, not a
 * per-environment one — same numbers in dev, staging, and prod, so they live
 * here as constants rather than env vars. One file so both routes' caps are
 * visible without hunting through handler code.
 */
export const RATE_LIMITS = {
  publish: { limit: 20, windowSeconds: 24 * 60 * 60 },
  upload: { limit: 100, windowSeconds: 60 * 60 },
} as const;
