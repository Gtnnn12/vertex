# Standalone server image — deploy ONLY the API (packages/server).
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Minimal manifest copies. patches/ is included so the lockfile's
# patchedDependencies entry resolves; allowUnusedPatches in pnpm-workspace.yaml
# stops pnpm 10 failing because the only patch consumer (desktop) is excluded
# from this filtered install.
COPY package.json pnpm-workspace.yaml .npmrc* patches patches/
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && printf 'allowUnusedPatches: true\n' >> pnpm-workspace.yaml \
    && pnpm install --frozen-lockfile=false --filter @vertex/server... --ignore-scripts

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
