# syntax=docker/dockerfile:1
#
# Production image for @plinth/dashboard (Next.js standalone output). BUILD FROM
# THE MONOREPO ROOT so Turborepo can prune the workspace:
#   docker build -f apps/dashboard/Dockerfile -t plinth-dashboard .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# --- pruner: minimal subset of the monorepo for @plinth/dashboard ---
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.18 prune @plinth/dashboard --docker

# --- builder: install on pruned manifests, then next build (standalone) ---
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# NEXT_PUBLIC_* are inlined into the client bundle at build (the Sentry DSN is
# public). The server env contract is validated at runtime, not build, so
# SKIP_ENV_VALIDATION lets `next build` collect routes without real secrets —
# the running container reads real values from Fly secrets.
ARG NEXT_PUBLIC_SENTRY_DSN_DASHBOARD=""
ENV NEXT_PUBLIC_SENTRY_DSN_DASHBOARD=$NEXT_PUBLIC_SENTRY_DSN_DASHBOARD \
  SKIP_ENV_VALIDATION=1
RUN pnpm turbo build --filter=@plinth/dashboard

# --- runner: run the standalone server as a non-root user ---
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
# Next standalone bundles a minimal traced server + node_modules; static assets
# and public/ are copied alongside it (Next does not include them in standalone).
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/dashboard/server.js"]
