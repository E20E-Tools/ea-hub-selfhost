# syntax=docker/dockerfile:1.7
#
# EA-Hub self-hosted image: standalone Node server (TanStack Start / Nitro `node-server`)
# with a plain PostgreSQL backend (no Supabase, no Vercel). See README.md.
#
# The same image runs three things:
#   node selfhost/scripts/start.mjs     the web app (default command)
#   node selfhost/scripts/migrate.mjs   database setup + first admin (compose `migrate`, Helm Job)
#   node selfhost/scripts/run-job.mjs <job>      a scheduled job (compose `cron`, Helm CronJob)
#
# Build args:
#   WITH_LOCAL_MODEL=1  bundle the multilingual MiniLM model for local semantic search (~120 MB);
#                       set WITH_LOCAL_MODEL=0 for a smaller image without it
#   RUN_TESTS=0         set to 1 to run the release tests during the build

ARG NODE_VERSION=22
ARG BUN_VERSION=1

FROM oven/bun:${BUN_VERSION} AS bun

# ---------- build ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV CI=1

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY local-backend/package.json local-backend/package-lock.json local-backend/
ARG WITH_LOCAL_MODEL=1
RUN if [ "$WITH_LOCAL_MODEL" = "1" ]; then \
      npm ci --prefix local-backend --omit=dev --ignore-scripts --no-audit --no-fund; \
    else mkdir -p local-backend/node_modules; fi

COPY . .
RUN if [ "$WITH_LOCAL_MODEL" = "1" ]; then node scripts/prepare-model.mjs; \
    else mkdir -p .local/models; fi

ARG RUN_TESTS=0
RUN if [ "$RUN_TESTS" = "1" ]; then npm run test:release; fi
# Never inherit a VERCEL flag: it would switch Nitro to the Vercel preset.
RUN env -u VERCEL npx vite build && test -f .output/server/index.mjs

# Runtime dependencies of the plain-Node scripts (migrate/start); the app itself is bundled.
RUN mkdir -p /runtime/node_modules && \
    cp -r node_modules/postgres node_modules/drizzle-orm /runtime/node_modules/
# The runtime image has no shell: prepare the writable data folder here.
RUN mkdir -p /out/data/storage && chmod -R 775 /out/data

# ---------- runtime ----------
# Distroless: Node.js plus the C/C++ runtime libraries only. No shell, package manager or npm,
# so far fewer packages that can carry vulnerabilities.
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian12:nonroot AS runtime
WORKDIR /app
ARG WITH_LOCAL_MODEL=1
ARG VERSION=dev
LABEL org.opencontainers.image.title="EA-Hub (self-hosted)" \
      org.opencontainers.image.description="EA-Hub with plain PostgreSQL — Docker Compose, Helm or Kubernetes" \
      org.opencontainers.image.version="${VERSION}"
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin \
    HOME=/tmp \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/data/storage \
    EA_HUB_VERSION=${VERSION} \
    NODE_OPTIONS=--enable-source-maps

COPY --from=build --chown=1000:0 /app/.output ./.output
COPY --from=build --chown=1000:0 /runtime/node_modules ./node_modules
COPY --from=build --chown=1000:0 /app/drizzle/migrations ./drizzle/migrations
COPY --from=build --chown=1000:0 /app/selfhost ./selfhost
COPY --from=build --chown=1000:0 /app/local-backend/semantic.mjs ./local-backend/semantic.mjs
COPY --from=build --chown=1000:0 /app/local-backend/node_modules ./local-backend/node_modules
COPY --from=build --chown=1000:0 /app/.local/models ./.local/models

# Group 0 + group-writable: also runs under OpenShift's random user IDs (always in group 0).
COPY --from=build --chown=1000:0 /out/data /data
VOLUME ["/data/storage"]

# uid 1000, group 0 (the Helm chart and docs use uid 1000; OpenShift picks its own uid).
USER 1000:0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# The base image's entrypoint is node: reset it so "command: node …" keeps working everywhere.
ENTRYPOINT []
CMD ["node", "selfhost/scripts/start.mjs"]
