# @plinth/site-builder

The publish pipeline's build engine (ADR-0003, ADR-0013): a minimal Astro
project whose single page renders a content snapshot through
`@plinth/renderer` and the template's components — the same pair the
dashboard's preview uses.

Never runs standalone in normal operation; the api's Inngest build job
invokes it per version:

```sh
SNAPSHOT_PATH=/path/to/snapshot.json \
TEMPLATE_ID=template-norven \
OUT_DIR=/path/to/out \
pnpm --filter @plinth/site-builder run build:site
```

The script is `build:site`, not `build`, so `turbo run build` (verify/CI)
never invokes it — it only makes sense with a snapshot to build.
