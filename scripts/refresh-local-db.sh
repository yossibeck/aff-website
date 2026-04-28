#!/usr/bin/env bash
# Dumps remote D1 and refreshes the local wrangler DB for local dev.
# Usage: ./scripts/refresh-local-db.sh
set -e

DUMP_FILE="local-dev.sql"

echo "→ Exporting remote D1..."
npx wrangler d1 export aff-story-db --remote --output "$DUMP_FILE"

echo "→ Wiping local D1 state..."
rm -rf .wrangler/state/v3/d1

echo "→ Importing into local D1..."
npx wrangler d1 execute aff-story-db --local --file="$DUMP_FILE" > /dev/null

echo "✓ Local DB refreshed from remote. Run: npm run dev"
