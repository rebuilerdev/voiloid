# syntax=docker/dockerfile:1.7
#
# すべてのアプリのイメージを 1 つの Dockerfile から作る（--target で選ぶ）。
#   api / gateway / bot / web / worker / migrate
# 本番マシン上で docker compose build により構築する（compose.yaml）。

ARG NODE_VERSION=24.14.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app

# ---------- 依存パッケージの定義（キャッシュを効かせるため、ソースより先にコピーする） ----------
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/gateway/package.json apps/gateway/
COPY apps/bot/package.json apps/bot/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

# ネイティブモジュール（@discordjs/opus）のビルドに必要
FROM manifests AS toolchain
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# ---------- ビルド ----------
FROM toolchain AS build
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Web GUI のブラウザ向け設定はビルド時に埋め込まれる
ARG NEXT_PUBLIC_DISCORD_CLIENT_ID
ARG NEXT_PUBLIC_WORKER_CONTROL_SERVER
ARG NEXT_PUBLIC_WORKER_IMAGE
ENV NEXT_PUBLIC_USE_MOCK=false \
    NEXT_PUBLIC_API_BASE_URL="" \
    NEXT_PUBLIC_DISCORD_CLIENT_ID=${NEXT_PUBLIC_DISCORD_CLIENT_ID} \
    NEXT_PUBLIC_WORKER_CONTROL_SERVER=${NEXT_PUBLIC_WORKER_CONTROL_SERVER} \
    NEXT_PUBLIC_WORKER_IMAGE=${NEXT_PUBLIC_WORKER_IMAGE} \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run db:generate \
 && npm run build -w @voiloid/api -w @voiloid/gateway -w @voiloid/bot -w @voiloid/worker -w @voiloid/web

# ---------- アプリごとの本番依存 ----------
# devDependencies と optional（@prisma/client が任意で要求する prisma CLI・typescript など）を含めない
FROM manifests AS api-deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional --ignore-scripts -w @voiloid/api

FROM manifests AS gateway-deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional --ignore-scripts -w @voiloid/gateway

FROM toolchain AS bot-deps
# @discordjs/opus はインストール時にネイティブモジュールを用意する（スクリプトを有効にする）
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional -w @voiloid/bot
# DAVE（音声の E2E 暗号化）のネイティブモジュールは optional のため、実行環境のものを明示的に入れる
RUN --mount=type=cache,target=/root/.npm set -eu; \
    version="$(node -p "require('@snazzah/davey/package.json').version")"; \
    package="@snazzah/davey-linux-$(node -p 'process.arch')-gnu"; \
    mkdir -p "/tmp/davey" "node_modules/$package"; \
    (cd /tmp/davey && npm pack "$package@$version" --silent > name); \
    tar -xzf "/tmp/davey/$(cat /tmp/davey/name)" -C "node_modules/$package" --strip-components=1; \
    node -e "require('@snazzah/davey'); require('@discordjs/opus')"

FROM manifests AS worker-deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional --ignore-scripts -w @voiloid/worker

FROM manifests AS migrate-deps
# Prisma CLI（database パッケージの devDependencies）を含める
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts -w @voiloid/database

# ---------- 実行イメージ ----------
FROM base AS runtime
ENV NODE_ENV=production
USER node

FROM runtime AS api
COPY --from=api-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime AS gateway
COPY --from=gateway-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/gateway/dist ./dist
EXPOSE 4100 4101
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4101/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime AS bot
# 音声は WAV → PCM → Opus に Node.js 内で変換する（FFmpeg は不要）
COPY --from=bot-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/bot/dist ./dist
CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM runtime AS web
ENV PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

# 利用者のマシンで動かす音声合成 Worker（GHCR に公開する）
FROM runtime AS worker
ENV HEALTH_PORT=8080
COPY --from=worker-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/worker/dist ./dist
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]

# DB の Migration（デプロイ時に 1 回だけ実行する）
FROM runtime AS migrate
WORKDIR /app/packages/database
COPY --from=migrate-deps --chown=node:node /app/node_modules /app/node_modules
COPY --chown=node:node packages/database/package.json packages/database/prisma.config.ts ./
COPY --chown=node:node packages/database/prisma ./prisma
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]
