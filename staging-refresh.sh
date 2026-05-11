#!/usr/bin/env bash
# staging-refresh.sh
#
# Refreshes staging D1 from production, applies pending migrations,
# and patches the DB so the pets tenant is served by the staging worker.
#
# Usage:
#   ./staging-refresh.sh              # refresh + patch pets tenant
#   ./staging-refresh.sh --no-export  # skip prod export (re-use /tmp/prod-staging-refresh.sql)
#
# After running: open https://aff-website-staging.yossibeck.workers.dev/story/<slug>
# The staging worker will identify itself as the pets tenant via tenant_domains.

set -euo pipefail

PROD_DB="aff-story-db"
STAGING_DB="aff-story-db-staging"
STAGING_WORKER_DOMAIN="aff-website-staging.yossibeck.workers.dev"
PETS_TENANT_ID=136
TEMP_FILE="/tmp/prod-staging-refresh.sql"

# ── 1. Export production ───────────────────────────────────────────────────────
if [[ "${1:-}" == "--no-export" ]]; then
  echo "⏭  Skipping export — using existing $TEMP_FILE"
else
  echo "▶ Exporting production DB to $TEMP_FILE…"
  wrangler d1 export "$PROD_DB" --remote --output "$TEMP_FILE"
  echo "   Export done."
fi

# ── 2. Overwrite staging with prod dump ────────────────────────────────────────
echo "▶ Importing into staging DB (may take ~30s)…"
wrangler d1 execute "$STAGING_DB" --remote --file="$TEMP_FILE"
echo "   Import done."

# ── 3. Apply pending migrations ────────────────────────────────────────────────
# content_type already exists in prod (was added in an earlier migration).
# We only need to add the two hero columns; silence errors if they already exist.
echo "▶ Applying hero image column migrations…"
wrangler d1 execute "$STAGING_DB" --remote \
  --command="ALTER TABLE stories ADD COLUMN hero_desktop_url TEXT" 2>/dev/null \
  && echo "   + hero_desktop_url added." \
  || echo "   hero_desktop_url already exists — skipped."

wrangler d1 execute "$STAGING_DB" --remote \
  --command="ALTER TABLE stories ADD COLUMN hero_mobile_url TEXT" 2>/dev/null \
  && echo "   + hero_mobile_url added." \
  || echo "   hero_mobile_url already exists — skipped."

# ── 4. Patch pets tenant domain → staging worker ───────────────────────────────
# getTenant() in db.ts looks up tenant_domains by hostname.
# Replace the prod domain with the staging worker's .workers.dev URL
# so any request to the staging worker resolves as the pets tenant.
echo "▶ Patching pets tenant domain to staging worker…"
wrangler d1 execute "$STAGING_DB" --remote \
  --command="UPDATE tenant_domains SET domain='$STAGING_WORKER_DOMAIN' WHERE tenant_id=$PETS_TENANT_ID"
wrangler d1 execute "$STAGING_DB" --remote \
  --command="UPDATE tenants SET domain='$STAGING_WORKER_DOMAIN' WHERE id=$PETS_TENANT_ID"
echo "   Pets tenant now served at: $STAGING_WORKER_DOMAIN"

# ── 5. Verify ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ Verifying…"
wrangler d1 execute "$STAGING_DB" --remote \
  --command="SELECT id, slug, content_type, hero_desktop_url, hero_mobile_url FROM stories WHERE slug='why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption'" \
  2>&1 | grep -A5 '"results"' || true

echo ""
echo "✅ Staging DB refreshed."
echo ""
echo "   Test URL: https://$STAGING_WORKER_DOMAIN/story/why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption"
echo ""
echo "   ⚠️  hero_desktop_url and hero_mobile_url are NULL until you set them:"
echo "   wrangler d1 execute $STAGING_DB --remote --command=\"UPDATE stories SET hero_desktop_url='<url>', hero_mobile_url='<url>' WHERE slug='why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption'\""
