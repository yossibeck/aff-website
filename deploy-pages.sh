#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec npx wrangler pages deploy . --project-name=aff-website
