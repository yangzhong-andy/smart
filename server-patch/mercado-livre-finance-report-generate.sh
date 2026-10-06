#!/usr/bin/env bash
set -euo pipefail

# The hourly importer only downloads ready reports. Request a new official
# report each day so later Mercado Pago debits also reach the wallet ledger.
exec 9>/run/lock/smart-baxi-mercado-livre-finance-sync.lock
flock -n 9 || exit 0

log_file="/var/log/mercado-livre-finance-sync.log"
timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
body='{"generate":true,"days":30,"waitMs":0}'

if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/finance/sync "$body" 300 2>&1)"; then
  printf '[%s] report requested: %.1200s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] report request failed: %.1200s\n' "$timestamp" "$result" >> "$log_file"
  exit 1
fi
