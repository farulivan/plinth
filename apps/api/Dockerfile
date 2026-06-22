# syntax=docker/dockerfile:1
#
# Production image for @plinth/api. BUILD FROM THE MONOREPO ROOT so Turborepo can
# prune the workspace:
#   docker build -f apps/api/Dockerfile -t plinth-api .
#
# Stages: prune the workspace → install on pruned manifests → tsup bundle → slim
# runtime. tsup bundles the workspace @plinth/* TS source into dist/; npm deps
# stay external and install normally. The base ships libvips so Sharp (media
# pipeline, ADR-0006) has its native dependency ready before that code lands.

# --- base: Node 22 + libvips on Debian slim (alpine + Sharp is a known headache) ---
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends libvips42 \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# --- pruner: emit a minimal subset of the monorepo for @plinth/api ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.18 prune @plinth/api --docker

# --- installer: install on pruned manifests (layer-cached), then build ---
FROM base AS installer
# Manifests first so the install layer caches unless a package.json changes.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
# Full pruned source, then bundle the api via turbo (runs the tsup build script).
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@plinth/api
# Assemble a lean, self-contained deploy dir: package.json + dist (the `files`
# field) + prod-only node_modules. --node-linker=hoisted produces a flat tree of
# just the runtime closure (no .pnpm store of unused workspace devDeps), which is
# both smaller and free of symlinks for the COPY into the runner.
RUN pnpm --filter=@plinth/api deploy --prod --legacy --node-linker=hoisted /prod/api

# --- runner: run the bundle as a non-root user ---
FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs hono
COPY --from=installer --chown=hono:nodejs /prod/api /app
USER hono
WORKDIR /app
EXPOSE 4000
# instrument.js preloads Sentry before server.js imports the app.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "./dist/instrument.js", "./dist/server.js"]
