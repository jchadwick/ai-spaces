# ─────────────────────────────────────────────
# Stage: install deps
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /build

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
COPY packages/server/package.json ./packages/server/
COPY packages/plugin/package.json ./packages/plugin/
RUN npm ci

# ─────────────────────────────────────────────
# Stage: build all packages
# ─────────────────────────────────────────────
FROM deps AS builder

COPY tsconfig.base.json ./
COPY REMOTE_AGENTS.md ./REMOTE_AGENTS.md
COPY scripts/package-openclaw-plugin.mjs ./scripts/package-openclaw-plugin.mjs
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
COPY packages/server/ ./packages/server/
COPY packages/plugin/ ./packages/plugin/

RUN npm run build:shared && \
    npm run build:web && \
    npm run build:plugin && \
    npm run build -w @ai-spaces/server

RUN node scripts/package-openclaw-plugin.mjs \
      --dist /build/packages/plugin/dist \
      --package /build/packages/plugin/package.json \
      --out /plugin-artifacts

# ─────────────────────────────────────────────
# Stage: runtime — sidecar + plugin dist at /plugin
# ─────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /build

RUN mkdir -p /data /plugins

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages/shared/dist ./packages/shared/dist
COPY --from=builder /build/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /build/packages/server/dist ./packages/server/dist
COPY --from=builder /build/packages/server/drizzle ./packages/server/drizzle
COPY --from=builder /build/packages/server/package.json ./packages/server/package.json
COPY --from=builder /build/packages/web/dist ./packages/web/dist

# Compiled plugin available for extraction (e.g. docker cp <container>:/plugin .)
COPY --from=builder /build/packages/plugin/dist /plugin
COPY --from=builder /plugin-artifacts /plugins

ENV WEB_DIST=/build/packages/web/dist
ENV AI_SPACES_DATA=/data
ENV AI_SPACES_DB=/data/ai-spaces.db
ENV AI_SPACES_PLUGIN_DIR=/plugins

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.AI_SPACES_PORT || '3001') + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
