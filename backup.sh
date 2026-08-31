#!/usr/bin/env bash
# Trigger a manual DB snapshot inside the running VERTEX container.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker ps --format '{{.Names}}' | grep -q '^VERTEX$'; then
  echo "Error: VERTEX container is not running." >&2
  exit 1
fi

docker exec -w /app/packages/server VERTEX \
  node --import tsx/esm src/scripts/snapshot.ts
