#!/bin/bash
set -e

echo "=== Pushing database schema ==="
pnpm --filter @workspace/db run push-force

echo "=== Building API server ==="
pnpm --filter @workspace/api-server run build

echo "=== Build complete ==="
