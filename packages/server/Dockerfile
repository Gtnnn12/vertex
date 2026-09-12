# Standalone server image — deploy ONLY the API (packages/server).
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml .npmrc* patches patches/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && printf 'allowUnusedPatches: true\n' >> pnpm-workspace.yaml \
    && pnpm install --frozen-lockfile=false --filter @vertex/server... --ignore-scripts

# Copy sources and build. The shared package resolves its TS types directly
# from source ("main": "./src/types.ts"), so no build step is needed for it;
# the server runs from TS via tsx.
COPY packages/shared packages/shared
COPY packages/server packages/server

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3005 \
    DB_PATH=/data/vertex.db \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DISABLED=true

EXPOSE 3005

WORKDIR /app/packages/server
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
