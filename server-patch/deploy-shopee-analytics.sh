#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"

deploy_one() {
  local app="$1"
  local service="$2"
  local port="$3"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  local pm2_id
  local database_url
  local configured_engine
  local release_engine

  old_release="$(readlink -f "${base}/current")"
  test -d "${old_release}"
  test ! -e "${new_release}"
  test -f "${archive}"

  pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "${database_url}"

  mkdir -p "${new_release}"
  cp -a "${old_release}/." "${new_release}/"
  rm -rf "${new_release}/.next"
  tar -xzf "${archive}" -C "${new_release}"

  (
    cd "${new_release}"
    DATABASE_URL="${database_url}" npm run build
  )

  ln -sfn "${old_release}" "${base}/previous.next"
  mv -Tf "${base}/previous.next" "${base}/previous"
  ln -sfn "${new_release}" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"

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
  elif ! pm2 reload "${service}" --update-env; then
    ln -sfn "${old_release}" "${base}/current.rollback"
    mv -Tf "${base}/current.rollback" "${base}/current"
    pm2 reload "${service}" --update-env || true
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
    pm2 reload "${service}" --update-env || true
    return 1
  fi

  echo "app=${app} release=${tag} current=$(readlink -f "${base}/current") previous=$(readlink -f "${base}/previous")"
}

deploy_one baxi smart-baxi 3001
deploy_one sdfy smart-sdfy 3003

pm2 save
/usr/local/sbin/smart-erp-release-retention
