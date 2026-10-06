#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/order-poll.log"
exec 9>/run/lock/smart-erp-order-sync.lock
flock -n 9 || exit 0

for target in "baxi:3001" "sdfy:3003"; do
  app="${target%%:*}"
  port="${target##*:}"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  if result="$(/usr/local/sbin/smart-erp-api-post "$app" "$port" /api/tiktok/sync '{"dataType":"orders","days":1}' 180 2>&1)"; then
    printf '%s %s OK\n' "$timestamp" "$port" >> "$log_file"
  else
    printf '%s %s FAIL: %.300s\n' "$timestamp" "$port" "$result" >> "$log_file"
  fi
done
