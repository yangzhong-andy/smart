#!/usr/bin/env bash
set -Eeuo pipefail

archive="/tmp/creator-center-20260821T124500Z.tar.gz"
tag="20260821T124500Z-creator-center"

deploy() {
  local app="$1"
  local service="$2"
  local port="$3"
  local base="/srv/smart-erp/${app}"
  local current
  local release="${base}/releases/${tag}"
  local old
  local engine
  local code

  current="$(readlink -f "${base}/current")"
  test -d "${current}"
  test -f "${archive}"
  test ! -e "${release}"

  mkdir -p "${release}"
  cp -a "${current}/." "${release}/"
  tar -xzf "${archive}" -C "${release}"

  cd "${release}"
  set -a
  source "/etc/smart-erp/${app}.env"
  set +a
  npx prisma migrate deploy
  npm run build

  old="$(readlink -f "${base}/current")"
  ln -sfn "${old}" "${base}/previous"
  ln -sfn "${release}" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"

  engine="$(find "${release}/node_modules/.prisma/client" -maxdepth 1 -name 'libquery_engine-*.so.node' -print -quit)"
  export PRISMA_QUERY_ENGINE_LIBRARY="${engine}"
  pm2 restart "${service}" --update-env

  for _ in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/login" || true)"
    if [[ "${code}" == "200" ]]; then
      printf '%s release=%s previous=%s\n' "${app}" "${release}" "${old}"
      return 0
    fi
    sleep 1
  done

  ln -sfn "${old}" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  export PRISMA_QUERY_ENGINE_LIBRARY="$(find "${old}/node_modules/.prisma/client" -maxdepth 1 -name 'libquery_engine-*.so.node' -print -quit)"
  pm2 restart "${service}" --update-env
  printf '%s health check failed; restored previous release\n' "${app}" >&2
  return 1
}

deploy baxi smart-baxi 3001
deploy sdfy smart-sdfy 3003
pm2 save
