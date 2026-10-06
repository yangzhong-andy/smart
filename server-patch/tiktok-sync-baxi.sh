#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/tiktok-sync.log"
exec 9>/run/lock/smart-baxi-tiktok-full-sync.lock
flock -n 9 || exit 0

timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
printf '[%s] === 3001 TikTok 商品同步开始 ===\n' "$timestamp" >> "$log_file"
if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/tiktok/sync '{"dataType":"products","days":3}' 600 2>&1)"; then
  printf '[%s] 3001 商品同步成功: %s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] 3001 商品同步失败: %s\n' "$timestamp" "$result" >> "$log_file"
fi
