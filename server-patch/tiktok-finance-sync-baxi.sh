#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/tiktok-finance-sync.log"
exec 9>/run/lock/smart-baxi-tiktok-finance-sync.lock
flock -n 9 || exit 0

timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
printf '[%s] === 3001 TikTok 财务结算同步开始 ===\n' "$timestamp" >> "$log_file"

if statements="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/tiktok/sync '{"dataType":"statements","days":3}' 600 2>&1)"; then
  printf '[%s] 3001 结算单成功: %s\n' "$timestamp" "$statements" >> "$log_file"
else
  printf '[%s] 3001 结算单失败: %s\n' "$timestamp" "$statements" >> "$log_file"
  exit 1
fi

if payments="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/tiktok/sync '{"dataType":"payments","days":3}' 600 2>&1)"; then
  printf '[%s] 3001 回款成功: %s\n' "$timestamp" "$payments" >> "$log_file"
else
  printf '[%s] 3001 回款失败: %s\n' "$timestamp" "$payments" >> "$log_file"
  exit 1
fi
