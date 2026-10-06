#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"
migration="20260903101500_add_shopee_daily_operation_actions"

prepare_release() {
  local app="$1"
  local service="$2"
  local database="$3"
  local app_role="$4"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  local pm2_id
  local database_url

  old_release="$(readlink -f "${base}/current")"
  test -d "${old_release}"
  test ! -e "${new_release}"
  mkdir -p "${new_release}"
  cp -a "${old_release}/." "${new_release}/"
  rm -rf "${new_release}/.next"
  tar -xzf "${archive}" -C "${new_release}"

  pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "${database_url}"

  if ! runuser -u postgres -- psql -At -d "${database}" \
    -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name = '${migration}' AND finished_at IS NOT NULL" \
    | grep -qx "${migration}"; then
    if ! runuser -u postgres -- psql -At -d "${database}" \
      -c "SELECT to_regclass('\"ShopeeDailyOperationAction\"')" | grep -qx '"ShopeeDailyOperationAction"'; then
      runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" \
        -f "${new_release}/prisma/migrations/${migration}/migration.sql"
    fi
    (
      cd "${new_release}"
      DATABASE_URL="${database_url}" npx prisma migrate resolve --applied "${migration}"
    )
  fi

  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ShopeeDailyOperationAction" TO "${app_role}";
SQL

  (
    cd "${new_release}"
    DATABASE_URL="${database_url}" npm run build
  )
  printf '%s\n' "${old_release}" > "/tmp/${tag}-${app}.old"
}

activate_release() {
  local app="$1"
  local service="$2"
  local port="$3"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  local pm2_id
  local configured_engine
  local release_engine
  local healthy="false"

  old_release="$(cat "/tmp/${tag}-${app}.old")"
  ln -sfn "${old_release}" "${base}/previous.next"
  mv -Tf "${base}/previous.next" "${base}/previous"
  ln -sfn "${new_release}" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"

  pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
  configured_engine="$(pm2 env "${pm2_id}" | sed -n 's/^PRISMA_QUERY_ENGINE_LIBRARY: //p' | head -1)"
  if [ -n "${configured_engine}" ]; then
    release_engine="$(find "${new_release}/node_modules/.prisma/client" -maxdepth 1 -type f -name 'libquery_engine-*.so.node' -print -quit)"
    test -f "${release_engine}"
    if ! (cd "${new_release}" && PRISMA_QUERY_ENGINE_LIBRARY="${release_engine}" pm2 reload "${service}" --update-env); then
      ln -sfn "${old_release}" "${base}/current.rollback"
      mv -Tf "${base}/current.rollback" "${base}/current"
      pm2 reload "${service}" --update-env || true
      return 1
    fi
  else
    if ! pm2 reload "${service}" --update-env; then
      ln -sfn "${old_release}" "${base}/current.rollback"
      mv -Tf "${base}/current.rollback" "${base}/current"
      pm2 reload "${service}" --update-env || true
      return 1
    fi
  fi

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
    pm2 reload "${service}" --update-env || true
    return 1
  fi
}

rollback_release() {
  local app="$1"
  local service="$2"
  local base="/srv/smart-erp/${app}"
  local old_release
  old_release="$(cat "/tmp/${tag}-${app}.old")"
  ln -sfn "${old_release}" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "${service}" --update-env || true
}

prepare_release baxi smart-baxi smart smart_baxi_app
prepare_release sdfy smart-sdfy smartsdfy smart_sdfy_app
if ! activate_release baxi smart-baxi 3001; then
  exit 1
fi
if ! activate_release sdfy smart-sdfy 3003; then
  rollback_release baxi smart-baxi
  exit 1
fi

pm2 save
/usr/local/sbin/smart-erp-release-retention
rm -f "/tmp/${tag}-baxi.old" "/tmp/${tag}-sdfy.old"

echo "release=${tag}"
readlink -f /srv/smart-erp/baxi/current
readlink -f /srv/smart-erp/sdfy/current
