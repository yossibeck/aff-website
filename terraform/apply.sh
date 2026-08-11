#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f terraform.tfvars ]]; then
  echo "Error: terraform/terraform.tfvars not found."
  echo "Create it with: echo 'cloudflare_api_token = \"your-token\"' > terraform/terraform.tfvars"
  exit 1
fi

terraform init -upgrade
terraform apply
