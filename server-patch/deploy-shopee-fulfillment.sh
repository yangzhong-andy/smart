#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"

prepare_release() {
  local app="$1"
  local service="$2"
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
  tar -xzf "${archive}" -C "${new_release}"

  pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "${database_url}"
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
  local healthy="false"
  local pm2_id
  local configured_engine
  local release_engine
  local reloaded="false"

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
    if (
      cd "${new_release}"
      PRISMA_QUERY_ENGINE_LIBRARY="${release_engine}" pm2 reload "${service}" --update-env
    ); then
      reloaded="true"
    fi
  else
    if pm2 reload "${service}"; then
      reloaded="true"
    fi
  fi
  if [ "${reloaded}" = "true" ]; then
    for _attempt in $(seq 1 30); do
      if curl --fail --silent --max-time 5 "http://127.0.0.1:${port}/login" >/dev/null; then
        healthy="true"
        break
      fi
      sleep 1
    done
  fi
  configured_engine="$(pm2 env "$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)" | sed -n 's/^PRISMA_QUERY_ENGINE_LIBRARY: //p' | head -1)"
  if [ -n "${configured_engine}" ] && [ ! -f "${configured_engine}" ]; then
    healthy="false"
  fi
  if [ "${healthy}" != "true" ]; then
    ln -sfn "${old_release}" "${base}/current.rollback"
    mv -Tf "${base}/current.rollback" "${base}/current"
    pm2 reload "${service}" || true
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
  pm2 reload "${service}" || true
}

prepare_release baxi smart-baxi
prepare_release sdfy smart-sdfy
activate_release baxi smart-baxi 3001
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
