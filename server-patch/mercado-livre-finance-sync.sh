#!/usr/bin/env bash
set -euo pipefail

exec 9>/run/lock/smart-baxi-mercado-livre-finance-sync.lock
flock -n 9 || exit 0

log_file="/var/log/mercado-livre-finance-sync.log"
timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
body='{"generate":false,"waitMs":0}'

if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/finance/sync "$body" 300 2>&1)"; then
  printf '[%s] OK: %.1200s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] FAIL: %.1200s\n' "$timestamp" "$result" >> "$log_file"
  exit 1
fi
