#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/lock/smart-baxi-mercado-livre-advertising-sync.lock
flock -n 9 || exit 0

log_file="/var/log/mercado-livre-advertising-sync.log"
timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/advertising/sync '{"days":90}' 300 2>&1)"; then
  printf '[%s] advertising OK: %.1500s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] advertising FAIL: %.1500s\n' "$timestamp" "$result" >> "$log_file"
fi

