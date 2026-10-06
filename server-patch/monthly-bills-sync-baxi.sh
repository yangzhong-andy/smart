#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/lock/smart-baxi-monthly-bills-sync.lock
flock -n 9 || exit 0
/usr/local/sbin/smart-erp-api-post baxi 3001 /api/monthly-bills/sync-all '{}' 300
printf '\n'
