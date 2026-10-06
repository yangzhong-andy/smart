#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"
migration="20260830023000_add_shopee_orders"

deploy_one() {
  local app="$1"
  local service="$2"
  local port="$3"
  local database="$4"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  local pm2_id
  local database_url

  old_release="$(readlink -f "${base}/current")"
  test -d "${old_release}"
  pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "${database_url}"

  if [ ! -e "${new_release}" ]; then
    echo "[${app}] creating release from ${old_release}"
    mkdir -p "${new_release}"
    cp -a "${old_release}/." "${new_release}/"
    tar -xzf "${archive}" -C "${new_release}"
  else
    echo "[${app}] resuming existing release ${new_release}"
  fi

  echo "[${app}] applying additive Shopee order migration to ${database}"
  if ! runuser -u postgres -- psql -At -d "${database}" \
    -c 'SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = '\''20260830023000_add_shopee_orders'\'' AND finished_at IS NOT NULL' \
    | grep -qx "${migration}"; then
    if ! runuser -u postgres -- psql -At -d "${database}" -c "SELECT to_regclass('\"ShopeeOrder\"')" | grep -qx '"ShopeeOrder"'; then
      runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" \
        -f "${new_release}/prisma/migrations/${migration}/migration.sql"
    fi
    (
      cd "${new_release}"
      DATABASE_URL="${database_url}" npx prisma migrate resolve --applied "${migration}"
    )
  fi

  echo "[${app}] building ${tag}"
  (
    cd "${new_release}"
    DATABASE_URL="${database_url}" npm run build
  )

  echo "[${app}] activating ${tag}"
  ln -sfn "${old_release}" "${base}/previous.next"
  mv -Tf "${base}/previous.next" "${base}/previous"
  ln -sfn "${new_release}" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"
  if ! pm2 restart "${service}"; then
    ln -sfn "${old_release}" "${base}/current.rollback"
    mv -Tf "${base}/current.rollback" "${base}/current"
    pm2 restart "${service}" || true
    return 1
  fi

  local healthy="false"
  for _attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 5 "http://127.0.0.1:${port}/login" >/dev/null; then
      healthy="true"
      break
    fi
    sleep 1
  done
  if [ "${healthy}" != "true" ]; then
    ln -sfn "${old_release}" "${base}/current.rollback"
    mv -Tf "${base}/current.rollback" "${base}/current"
    pm2 restart "${service}" || true
    return 1
  fi
  echo "[${app}] healthy ${new_release}"
}

deploy_one baxi smart-baxi 3001 smart
deploy_one sdfy smart-sdfy 3003 smartsdfy

install -m 0755 /tmp/shopee-order-sync.sh /root/shopee-order-sync.sh
(
  crontab -l 2>/dev/null | grep -v '/root/shopee-order-sync.sh' || true
  echo '3,13,23,33,43,53 * * * * /root/shopee-order-sync.sh'
) | crontab -

pm2 save
/usr/local/sbin/smart-erp-release-retention

echo "release=${tag}"
readlink -f /srv/smart-erp/baxi/current
readlink -f /srv/smart-erp/sdfy/current
