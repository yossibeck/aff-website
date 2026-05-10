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
echo "▶ Building…"
astro build

# Wrangler generates its own wrangler.json inside dist/server; remove any stale
# deploy config so our env flag is respected
rm -f .wrangler/deploy/config.json

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "▶ Deploying to staging…"
wrangler deploy --env staging --config dist/server/wrangler.json

echo ""
echo "✅ Staging deploy complete."
echo "   Worker: https://aff-website-staging.<your-subdomain>.workers.dev"
echo "   To run migrations only: ./deploy.staging.sh --migrate"
