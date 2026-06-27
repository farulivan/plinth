## Summary

<!-- 2-3 sentences: what this PR delivers and why it exists. -->

## What's included

<!-- Commit-by-commit (or area-by-area). What each piece does, with the commit
     hash, and any choice that isn't obvious from the file list. -->

-

## Notable decisions & fixes

<!-- What a reviewer wouldn't derive from the diff: tradeoffs, surprises, things
     that broke and how they were resolved. Link an ADR if the architectural
     shape shifted. Delete if there's nothing of note. -->

-

## Verification

<!-- What you actually ran and the result — not just "tests pass". Include manual
     checks (curl output, browser behaviour) where relevant. -->

- [ ] `pnpm verify` green (format, lint, typecheck, test, build)
- [ ] cross-tenant RLS probe green (when the change touches `packages/db`)
- [ ] exercised manually where relevant (`pnpm dev`, screenshots for UI)

## Deferred (by design)

<!-- What this PR intentionally leaves out and where it lands. Delete if nothing. -->

-
