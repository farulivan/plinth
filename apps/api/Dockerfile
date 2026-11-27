# syntax=docker/dockerfile:1@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
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
FROM node:26-bookworm-slim@sha256:0042e17d232a87a2cd485be1da7900fca4d10a4ad11b29e9285da1d2e54798c9 AS base
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
WORKDIR /app
# pnpm is installed from npm at exactly the version root package.json's
# packageManager names. That field is read, never copied: it is what Renovate
# bumps and what pnpm checks when it runs, and a hardcoded copy drifted once,
# so the first publish after the bump died trying to download the missing
# version. npm rather than corepack, for two reasons: Node 25 stopped bundling
# corepack, and from pnpm 12 the package is a launcher whose native binary
# arrives through optional dependencies and a postinstall that corepack never
# runs, so a corepack-provisioned pnpm 12 has nothing to execute offline. A
# global npm install lands in /usr/local, readable by the non-root runtime
# user, with nothing left to fetch on first use. Only the manifest is copied,
# so this layer reruns only when package.json changes.
COPY package.json ./
RUN npm install -g "$(node -p "require('./package.json').packageManager")" \
  && npm cache clean --force

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
# Fail the build, not the first publish: run pnpm as runSiteBuild will (this
# user, this cwd, no network) and require the packageManager version. Any
# other version makes pnpm fetch the pinned one from the registry before it
# runs a script, which fails without network; `pnpm --version` alone only
# warns, so the versions are compared. /health never touches pnpm, so without
# this the gap only surfaces when someone publishes.
RUN --network=none test "pnpm@$(pnpm --version)" = "$(node -p "require('/app/package.json').packageManager")"
EXPOSE 4000
# instrument.js preloads Sentry before server.js imports the app.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "./dist/instrument.js", "./dist/server.js"]
