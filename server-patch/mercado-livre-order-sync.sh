#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/mercado-livre-order-sync.log"
exec 9>/run/lock/smart-erp-mercado-livre-order-sync.lock
flock -n 9 || exit 0

timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/orders/sync '{"days":3}' 300 2>&1)"; then
  printf '[%s] orders OK: %.1000s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] orders FAIL: %.1000s\n' "$timestamp" "$result" >> "$log_file"
fi

if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/webhook/process '{}' 120 2>&1)"; then
  printf '[%s] webhook OK: %.1000s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] webhook FAIL: %.1000s\n' "$timestamp" "$result" >> "$log_file"
fi
