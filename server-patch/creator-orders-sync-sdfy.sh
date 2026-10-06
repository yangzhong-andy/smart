#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/tiktok-creator-sync.log"
exec 9>/run/lock/smart-sdfy-tiktok-creator-sync.lock
flock -n 9 || exit 0

timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
if result="$(/usr/local/sbin/smart-erp-api-post sdfy 3003 /api/tiktok/sync '{"dataType":"affiliateOrders","days":3}' 600 2>&1)"; then
  printf '[%s] 3003 达人联盟订单同步成功: %s\n' "$timestamp" "$result" >> "$log_file"
else
  printf '[%s] 3003 达人联盟订单同步失败: %s\n' "$timestamp" "$result" >> "$log_file"
  exit 1
fi
