# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
#
# Production image for @plinth/api. BUILD FROM THE MONOREPO ROOT so Turborepo can
# prune the workspace:
#   docker build -f apps/api/Dockerfile -t plinth-api .
#
# Stages: prune the workspace (api + site-builder, ADR-0013) → install on
# pruned manifests → tsup bundle the api → carry the whole pruned tree into a
# slim runtime. tsup bundles the workspace @plinth/* TS source api imports
# into dist/; site-builder isn't imported, it's shelled out to at publish
# time, so its source and node_modules ship as-is instead. The base ships
# libvips so Sharp (media pipeline, ADR-0006) has its native dependency ready.

# --- base: Node 22 + libvips on Debian slim (alpine + Sharp is a known headache) ---
FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS base
# libvips: Sharp's native dependency (ADR-0006). postgresql-client-17: the
# pg_dump binary the weekly backup reaper shells out to (ADR-0011) — pinned to
# match Neon's Postgres 17 (pg_dump can't dump from a server newer than
# itself), pulled from the PGDG apt repo since bookworm's default package is
# v15.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libvips42 ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y curl gnupg \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
# COREPACK_HOME pinned to a shared, world-readable path: corepack otherwise
# caches the pnpm binary under $HOME per-user, so the non-root runtime user
# (a different account than whoever builds this image) would have to
# download it again on first use — needing outbound network at container
# boot instead of build time, and failing entirely in an egress-restricted
# environment.
ENV COREPACK_HOME="/pnpm/corepack"
WORKDIR /app
# The version is read from root package.json's packageManager, never copied
# here: that field is what corepack resolves at runtime (walking up from
# apps/api) and what Renovate bumps. A hardcoded copy drifted once — the
# runtime user can't write this cache, so the first publish after the bump
# died trying to download the missing version. `install -g` also makes it
# the default outside the workspace, as `prepare --activate` did. Only the
# manifest is copied, so this layer reruns only when package.json changes.
COPY package.json ./
RUN corepack enable \
  && corepack install -g "$(node -p "require('./package.json').packageManager")" \
  && chmod -R a+rX /pnpm

# --- pruner: emit a minimal subset of the monorepo for @plinth/api AND
# @plinth/site-builder (ADR-0013): the api shells out to the builder's
# `astro build` at publish time, so its workspace has to ship in this image
# too, not just get bundled by tsup like everything else api imports. ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.18 prune @plinth/api @plinth/site-builder --docker

# --- installer: install on pruned manifests (layer-cached), then build ---
FROM base AS installer
# Manifests first so the install layer caches unless a package.json changes.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Full install, not --prod: tsup (api's devDependency) has to be present to
# produce dist/ below. The runner stage below carries this whole tree forward
# rather than extracting an isolated prod-only closure — unlike a plain
# Node service, this image needs pnpm's workspace resolution intact at
# runtime for `pnpm --filter @plinth/site-builder run build:site` to work at
# all, which an isolated `pnpm deploy` extraction would break.
RUN pnpm install --frozen-lockfile
# Full pruned source, then bundle the api via turbo (runs the tsup build
# script; site-builder has no generic "build" task by design — ADR-0013 — so
# turbo skips it here and it's built on demand at publish time instead).
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@plinth/api

# --- runner: run the installed tree as a non-root user ---
FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --create-home --uid 1001 --gid nodejs hono
COPY --from=installer --chown=hono:nodejs /app /app
USER hono
# apps/api/, not the workspace root — matches where dist/ lands, and pnpm's
# workspace resolution walks upward from any cwd, so `pnpm --filter
# @plinth/site-builder run build:site` (runSiteBuild, ADR-0013) still finds
# the workspace root from here exactly like it does from apps/api in `pnpm dev`.
WORKDIR /app/apps/api
# Fail the build, not the first publish: resolve pnpm exactly as runSiteBuild
# will — this user, this cwd, no network — so a version the shared cache
# doesn't hold, or this user can't read, stops the image here. /health never
# touches pnpm, so without this the gap only surfaces when someone publishes.
RUN COREPACK_ENABLE_NETWORK=0 pnpm --version
EXPOSE 4000
# instrument.js preloads Sentry before server.js imports the app.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "./dist/instrument.js", "./dist/server.js"]
