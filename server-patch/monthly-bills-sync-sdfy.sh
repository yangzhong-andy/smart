#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/lock/smart-sdfy-monthly-bills-sync.lock
flock -n 9 || exit 0
/usr/local/sbin/smart-erp-api-post sdfy 3003 /api/monthly-bills/sync-all '{}' 300
printf '\n'
