#!/usr/bin/env bash
set -Eeuo pipefail

run_seed() {
  local app="$1"
  local service="$2"
  local app_dir="/srv/smart-erp/${app}/current"
  local pm2_id
  local database_url

  pm2_id="$(pm2 id "$service" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "$pm2_id" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "$database_url"
  install -d -m 0700 "${app_dir}/tmp"
  install -m 0600 /tmp/seed-shopee-sku-mappings.mjs "${app_dir}/tmp/seed-shopee-sku-mappings.mjs"
  (
    cd "$app_dir"
    DATABASE_URL="$database_url" node tmp/seed-shopee-sku-mappings.mjs
  )
  rm -f "${app_dir}/tmp/seed-shopee-sku-mappings.mjs"
}

run_seed baxi smart-baxi
run_seed sdfy smart-sdfy
