#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/shopee-warehouse-reconcile.log"
exec 9>/run/lock/smart-erp-shopee-warehouse-reconcile.lock
flock -n 9 || exit 0

# The report API interprets dates in each shop's destination-country timezone.
# Reconcile a rolling seven-day window so delayed order syncs and missed
# webhooks are repaired without charging any order twice.
end_date="$(date '+%Y-%m-%d')"
start_date="$(date -d '6 days ago' '+%Y-%m-%d')"

# This release repairs the active baxi/Shopee environment. The 3003
# environment is on a separate older release and is intentionally not
# touched until its own authorization and warehouse mapping are reviewed.
for target in "baxi:3001"; do
  app="${target%%:*}"
  port="${target##*:}"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  body="{\"platform\":\"SHOPEE\",\"startDate\":\"${start_date}\",\"endDate\":\"${end_date}\"}"
  if result="$(/usr/local/sbin/smart-erp-api-post "$app" "$port" /api/warehouse-funds/reconcile "$body" 240 2>&1)"; then
    printf '[%s] %s OK: %.1200s\n' "$timestamp" "$port" "$result" >> "$log_file"
  else
    printf '[%s] %s FAIL: %.1200s\n' "$timestamp" "$port" "$result" >> "$log_file"
  fi
done
