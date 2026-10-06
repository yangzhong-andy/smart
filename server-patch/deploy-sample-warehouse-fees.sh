#!/usr/bin/env bash
set -Eeuo pipefail

base=/srv/smart-erp/baxi
current="$base/current"
release="$base/releases/20260819T-sample-warehouse-fees-v2"
patch=/tmp/sample-warehouse-fees-patch

test -L "$current"
test -d "$current"
test -d "$patch"
test ! -e "$release"

old_target="$(readlink -f "$current")"

mkdir -p "$release"
cp -a "$current/." "$release/"
rm -rf "$release/node_modules" "$release/.next"
ln -s "$old_target/node_modules" "$release/node_modules"

install -m 0644 "$patch/profit-report-types.ts" "$release/src/lib/profit-report-types.ts"
install -m 0644 "$patch/profit-report-route.ts" "$release/src/app/api/profit-report/route.ts"
install -m 0644 "$patch/warehouse-fund-reconciliation.ts" "$release/src/lib/warehouse-fund-reconciliation.ts"
install -m 0644 "$patch/warehouse-funds-reconcile-route.ts" "$release/src/app/api/warehouse-funds/reconcile/route.ts"
install -m 0644 "$patch/WarehouseFundLedger.tsx" "$release/src/components/logistics/WarehouseFundLedger.tsx"
install -m 0644 "$patch/tiktok-sync-route.ts" "$release/src/app/api/tiktok/sync/route.ts"
install -m 0644 "$patch/tiktok-webhook-route.ts" "$release/src/app/api/tiktok/webhook/route.ts"

cd "$release"
set -a
source /etc/smart-erp/baxi.env
set +a
npm run build

ln -sfn "$old_target" "$base/previous"
ln -sfn "$release" "$current"
pm2 restart smart-baxi --update-env
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3001/login >/dev/null
printf 'released=%s\nprevious=%s\n' "$release" "$old_target"
