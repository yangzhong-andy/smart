#!/usr/bin/env bash
set -Eeuo pipefail

exec 9>/run/lock/smart-baxi-mercado-livre-product-sync.lock
flock -n 9 || exit 0

/usr/local/sbin/smart-erp-api-post \
  baxi 3001 /api/mercado-livre/products/sync '{"visitDays":90}' 300 \
  >/dev/null
