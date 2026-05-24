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
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
COPY packages/server/ ./packages/server/
COPY packages/plugin/ ./packages/plugin/

RUN npm run build:shared && \
    npm run build:web && \
    npm run build:plugin && \
    npm run build -w @ai-spaces/server

RUN mkdir -p /plugin-package/openclaw-spaces/dist /plugin-artifacts && \
    cp -R /build/packages/plugin/dist/. /plugin-package/openclaw-spaces/dist/ && \
    cp /build/packages/plugin/package.json /plugin-package/openclaw-spaces/package.json && \
    tar -czf /plugin-artifacts/openclaw-spaces-latest.tar.gz -C /plugin-package openclaw-spaces

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
CMD ["node", "packages/server/dist/index.js"]
