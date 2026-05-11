#!/usr/bin/env bash
# staging-refresh.sh
#
# Refreshes staging D1 from production, applies pending migrations,
# and patches the DB so the pets tenant is served by the staging worker.
#
# Usage:
#   ./staging-refresh.sh              # full refresh + patch
#   ./staging-refresh.sh --no-export  # skip prod export (re-use cached /tmp file)
#
# After running, open:
#   https://aff-website-staging.yossibeck.workers.dev/story/why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption

set -euo pipefail

PROD_DB="aff-story-db"
STAGING_DB="aff-story-db-staging"
STAGING_WORKER_DOMAIN="aff-website-staging.yossibeck.workers.dev"
PETS_TENANT_ID=136
TEMP_FILE="/tmp/prod-staging-refresh.sql"
PATCHED_FILE="/tmp/prod-staging-refresh-patched.sql"

# -- 1. Export production -------------------------------------------------------
if [[ "${1:-}" == "--no-export" ]]; then
  echo "Skipping export -- using existing ${TEMP_FILE}"
else
  echo "Exporting production DB..."
  wrangler d1 export "${PROD_DB}" --remote --output "${TEMP_FILE}"
  echo "Export done."
fi

# -- 2. Patch dump: add DROP TABLE IF EXISTS before each CREATE TABLE -----------
# The D1 export does not include DROP statements, so a re-import would fail
# with "table already exists". We prepend a DROP before each CREATE TABLE.
echo "Preprocessing dump..."
python3 - <<'PYEOF'
import re, os

src = os.environ.get("TEMP_FILE", "/tmp/prod-staging-refresh.sql")
dst = os.environ.get("PATCHED_FILE", "/tmp/prod-staging-refresh-patched.sql")

with open(src) as f:
    content = f.read()

# Insert DROP TABLE IF EXISTS before every CREATE TABLE <name>
content = re.sub(
    r'CREATE TABLE (\w+)',
    lambda m: f'DROP TABLE IF EXISTS {m.group(1)};\nCREATE TABLE {m.group(1)}',
    content
)

# Disable FK checks for the duration of the import
content = "PRAGMA foreign_keys=OFF;\n" + content + "\nPRAGMA foreign_keys=ON;\n"

with open(dst, "w") as f:
    f.write(content)

print(f"  Patched dump written to {dst}")
PYEOF

export TEMP_FILE PATCHED_FILE

# -- 3. Overwrite staging with patched dump ------------------------------------
echo "Importing into staging DB (may take ~30s)..."
wrangler d1 execute "${STAGING_DB}" --remote --file="${PATCHED_FILE}"
echo "Import done."

# -- 4. Apply pending migrations -----------------------------------------------
# content_type already exists in prod (added in an earlier migration).
# Only add the two hero columns; errors are silenced if they already exist.
echo "Applying hero image column migrations..."

wrangler d1 execute "${STAGING_DB}" --remote \
  --command="ALTER TABLE stories ADD COLUMN hero_desktop_url TEXT" 2>/dev/null \
  && echo "  + hero_desktop_url added." \
  || echo "  hero_desktop_url already exists -- skipped."

wrangler d1 execute "${STAGING_DB}" --remote \
  --command="ALTER TABLE stories ADD COLUMN hero_mobile_url TEXT" 2>/dev/null \
  && echo "  + hero_mobile_url added." \
  || echo "  hero_mobile_url already exists -- skipped."

# -- 5. Patch pets tenant domain -> staging worker -----------------------------
# getTenant() in db.ts joins tenant_domains by hostname.
# Replace the prod domain with the staging worker URL so requests to
# aff-website-staging.yossibeck.workers.dev resolve as the pets tenant.
echo "Patching pets tenant domain to staging worker..."
wrangler d1 execute "${STAGING_DB}" --remote \
  --command="UPDATE tenant_domains SET domain='${STAGING_WORKER_DOMAIN}' WHERE tenant_id=${PETS_TENANT_ID}"
wrangler d1 execute "${STAGING_DB}" --remote \
  --command="UPDATE tenants SET domain='${STAGING_WORKER_DOMAIN}' WHERE id=${PETS_TENANT_ID}"
echo "Pets tenant now served at: ${STAGING_WORKER_DOMAIN}"

# -- 6. Verify -----------------------------------------------------------------
echo ""
echo "Verifying cat story in staging..."
wrangler d1 execute "${STAGING_DB}" --remote \
  --command="SELECT id, slug, content_type, hero_desktop_url, hero_mobile_url FROM stories WHERE slug='why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption'" \
  2>&1 | grep -A 10 '"results"' || true

echo ""
echo "Done. Staging DB refreshed."
echo ""
echo "  Test URL: https://${STAGING_WORKER_DOMAIN}/story/why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption"
echo ""
echo "  NOTE: hero_desktop_url and hero_mobile_url are NULL until you set them:"
echo "  wrangler d1 execute ${STAGING_DB} --remote --command=\"UPDATE stories SET hero_desktop_url='<url>', hero_mobile_url='<url>' WHERE slug='why-your-cat-keeps-moving-things-the-cortisol-map-of-territory-disruption'\""
