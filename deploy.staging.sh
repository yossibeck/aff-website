#!/usr/bin/env bash
# Deploy to the staging Cloudflare Workers environment (aff-website-staging)
# Usage: ./deploy.staging.sh [--migrate]
#
#   --migrate   also run any pending migration files against aff-story-db-staging
#               (migrations/002-add-article-fields.sql, etc.)
#
# Prerequisites:
#   - wrangler CLI authenticated (wrangler login)
#   - astro and wrangler in PATH (npm install already run)

set -euo pipefail

STAGING_DB="aff-story-db-staging"
MIGRATIONS_DIR="migrations"

# ── Optional: run migrations ───────────────────────────────────────────────────
if [[ "${1:-}" == "--migrate" ]]; then
  echo "▶ Running migrations against $STAGING_DB…"
  for sql_file in "$MIGRATIONS_DIR"/*.sql; do
    echo "  → $sql_file"
    wrangler d1 execute "$STAGING_DB" --remote --file="$sql_file"
  done
  echo "✅ Migrations done."
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "▶ Building..."
npx astro build

rm -f .wrangler/deploy/config.json

# ── Patch wrangler.json with staging env ──────────────────────────────────────
# Astro generates dist/server/wrangler.json with no env blocks.
# --env staging is silently ignored unless we inject the staging env ourselves.
echo "▶ Injecting staging env into dist/server/wrangler.json..."
python3 - <<'PYEOF'
import json, sys

path = "dist/server/wrangler.json"
with open(path) as f:
    cfg = json.load(f)

cfg["env"] = {
    "staging": {
        "name": "aff-website-staging",
        "workers_dev": True,
        "routes": [],
        "d1_databases": [
            {
                "binding": "DB",
                "database_name": "aff-story-db-staging",
                "database_id": "7ec860f9-0dd4-40a5-83bc-4e2d0faf12d1"
            }
        ],
        "kv_namespaces": [
            {
                "binding": "SESSION",
                "id": "71194cbfcadf4ebea8740695c7ee9dc1"
            }
        ]
    }
}

with open(path, "w") as f:
    json.dump(cfg, f, indent=2)

print("  Staging env injected into", path)
PYEOF

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "▶ Deploying to staging..."
wrangler deploy --env staging --config dist/server/wrangler.json

echo ""
echo "✅ Staging deploy complete."
echo "   Worker: https://aff-website-staging.<your-subdomain>.workers.dev"
echo "   To run migrations only: ./deploy.staging.sh --migrate"
