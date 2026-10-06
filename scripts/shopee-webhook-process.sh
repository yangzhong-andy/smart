#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/shopee-webhook-process.log"
exec 9>/run/lock/smart-erp-shopee-webhook-process.lock
flock -n 9 || exit 0

for target in "baxi:3001" "sdfy:3003"; do
  app="${target%%:*}"
  port="${target##*:}"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  if result="$(/usr/local/sbin/smart-erp-api-post "$app" "$port" /api/shopee/webhook/process '{}' 50 2>&1)"; then
    printf '[%s] %s OK: %.800s\n' "$timestamp" "$port" "$result" >> "$log_file"
  else
    printf '[%s] %s FAIL: %.800s\n' "$timestamp" "$port" "$result" >> "$log_file"
  fi
done
