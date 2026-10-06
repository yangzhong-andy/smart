#!/usr/bin/env bash
set -Eeuo pipefail

for target in "baxi:3001:smart" "sdfy:3003:smartsdfy"; do
  IFS=: read -r app port database <<<"${target}"
  echo "app=${app} release=$(readlink -f "/srv/smart-erp/${app}/current")"
  curl --fail --silent --max-time 20 "http://127.0.0.1:${port}/login" >/dev/null
  curl --fail --silent --max-time 20 "http://127.0.0.1:${port}/tiktok/orders" >/dev/null
  curl --fail --silent --max-time 20 "http://127.0.0.1:${port}/finance/profit" >/dev/null
  curl --fail --silent --max-time 20 "http://127.0.0.1:${port}/settings/stores" >/dev/null
  runuser -u postgres -- psql -d "${database}" -Atc \
    'SELECT '\''orders='\'' || count(*) || '\'',latest_sync='\'' || COALESCE(max("syncedAt")::text, '\''none'\'') FROM "TikTokOrder";'
  runuser -u postgres -- psql -d "${database}" -Atc \
    'SELECT '\''platform='\'' || enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid=pg_type.oid WHERE typname='\''Platform'\'' AND enumlabel='\''MERCADO_LIVRE'\'';'
  test -f "/srv/smart-erp/${app}/current/src/lib/platform-orders/contract.ts"
done

pm2 status smart-baxi smart-sdfy
systemctl is-active smart-baxi-creator-orders-sync.timer smart-sdfy-creator-orders-sync.timer
crontab -l | grep -E 'order-sync-poll|tiktok-sync'
df -h / | tail -1
