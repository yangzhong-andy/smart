#!/usr/bin/env bash
set -Eeuo pipefail

for target in "baxi:3001" "sdfy:3003"; do
  app="${target%%:*}"
  port="${target##*:}"
  printf '%s %s creator 90-day backfill start\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$app"
  /usr/local/sbin/smart-erp-api-post "$app" "$port" /api/tiktok/sync '{"dataType":"affiliateOrders","days":90}' 600
  printf '\n'
done
