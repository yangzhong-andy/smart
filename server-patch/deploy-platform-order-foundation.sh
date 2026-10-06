#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"

deploy_one() {
  local app="$1"
  local service="$2"
  local port="$3"
  local database="$4"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"

  old_release="$(readlink -f "${base}/current")"
  test -d "${old_release}"
  test ! -e "${new_release}"

  echo "[${app}] cloning ${old_release}"
  mkdir -p "${new_release}"
  cp -a "${old_release}/." "${new_release}/"
  tar -xzf "${archive}" -C "${new_release}"

  echo "[${app}] applying additive platform enum"
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" \
    -c 'ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS '\''MERCADO_LIVRE'\'';'

  echo "[${app}] building ${tag}"
  (
    cd "${new_release}"
    npm run build
  )

  echo "[${app}] activating ${tag}"
  ln -sfn "${old_release}" "${base}/previous.next"
  mv -Tf "${base}/previous.next" "${base}/previous"
  ln -sfn "${new_release}" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"
  local prisma_engine="${base}/current/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
  if ! PRISMA_QUERY_ENGINE_LIBRARY="${prisma_engine}" pm2 restart "${service}" --update-env; then
    ln -sfn "${old_release}" "${base}/current.rollback"
    mv -Tf "${base}/current.rollback" "${base}/current"
    PRISMA_QUERY_ENGINE_LIBRARY="${prisma_engine}" pm2 restart "${service}" --update-env || true
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
    PRISMA_QUERY_ENGINE_LIBRARY="${prisma_engine}" pm2 restart "${service}" --update-env || true
    return 1
  fi
  echo "[${app}] healthy ${new_release}"
}

deploy_one baxi smart-baxi 3001 smart
deploy_one sdfy smart-sdfy 3003 smartsdfy
pm2 save
/usr/local/sbin/smart-erp-release-retention

echo "release=${tag}"
readlink -f /srv/smart-erp/baxi/current
readlink -f /srv/smart-erp/sdfy/current
