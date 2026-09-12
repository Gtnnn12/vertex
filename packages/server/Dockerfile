# Standalone server image — deploy ONLY the API (packages/server).
# The repo-root Dockerfile is for the full Electron app; this one has no
# ffmpeg/gosu/electron baggage (ffmpeg is optional at runtime: thumbnails
# degrade gracefully — see utils/thumbnail.ts).
FROM node:20-slim

WORKDIR /app

# Runtime deps only: better-sqlite3 needs prebuilds (no compiler needed on
# node 20 — prebuilt binaries are downloaded). Keep the layer minimal.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install workspace deps (server + its @backspace/shared dependency).
# patches/ must be present: root package.json declares patchedDependencies
# and pnpm fails with ENOENT if the patch file is missing.
COPY package.json pnpm-workspace.yaml .npmrc* ./
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile=false --filter @vertex/server...

# Build server + shared
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter @backspace/shared build 2>/dev/null || true \
    && pnpm --filter @vertex/server build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3005 \
    DB_PATH=/data/vertex.db \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DISABLED=true

EXPOSE 3005

WORKDIR /app/packages/server
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
