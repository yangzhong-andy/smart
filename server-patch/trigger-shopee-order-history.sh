#!/usr/bin/env bash
set -Eeuo pipefail

days="${1:-90}"
/usr/local/sbin/smart-erp-api-post baxi 3001 /api/shopee/orders/sync "{\"days\":${days}}" 600
