#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/shopee-settlement-sync.log"
exec 9>/run/lock/smart-erp-shopee-settlement-sync.lock
flock -n 9 || exit 0

for target in "baxi:3001" "sdfy:3003"; do
  app="${target%%:*}"
  port="${target##*:}"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  finance_status="FAIL"
  wallet_status="FAIL"
  finance_result=""
  wallet_result=""
  if finance_result="$(/usr/local/sbin/smart-erp-api-post "$app" "$port" /api/shopee/finance/sync '{"days":90}' 300 2>&1)"; then
    finance_status="OK"
  fi
  if wallet_result="$(/usr/local/sbin/smart-erp-api-post "$app" "$port" /api/shopee/wallets/official/sync '{"days":7}' 300 2>&1)"; then
    wallet_status="OK"
  fi
  if [[ "$finance_status" == "OK" && "$wallet_status" == "OK" ]]; then
    printf '[%s] %s OK finance=%.500s wallet=%.500s\n' "$timestamp" "$port" "$finance_result" "$wallet_result" >> "$log_file"
  else
    printf '[%s] %s FAIL finance(%s)=%.500s wallet(%s)=%.500s\n' "$timestamp" "$port" "$finance_status" "$finance_result" "$wallet_status" "$wallet_result" >> "$log_file"
  fi
done
