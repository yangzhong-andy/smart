#!/usr/bin/env bash
set -Eeuo pipefail

archive="/tmp/creator-center-20260821T124500Z.tar.gz"
migration="20260821000000_add_creator_order_attribution"
tag="20260821T124500Z-creator-center"

apply_schema() {
  local app="$1"
  local database="$2"
  local release="$3"

  cd "${release}"
  set -a
  source "/etc/smart-erp/${app}.env"
  set +a
  npx prisma migrate resolve --rolled-back "${migration}" || true
  su - postgres -c "psql -v ON_ERROR_STOP=1 -d ${database} -f '${release}/prisma/migrations/${migration}/migration.sql'"
  npx prisma migrate resolve --applied "${migration}"
}

activate() {
  local app="$1"
  local service="$2"
  local port="$3"
  local release="$4"
  local base="/srv/smart-erp/${app}"
  local old
  local engine
  local code

  cd "${release}"
  set -a
  source "/etc/smart-erp/${app}.env"
  set +a
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
  return 1
}

baxi_release="/srv/smart-erp/baxi/releases/${tag}"
test -d "${baxi_release}"
apply_schema baxi smart "${baxi_release}"
activate baxi smart-baxi 3001 "${baxi_release}"

sdfy_base="/srv/smart-erp/sdfy"
sdfy_release="${sdfy_base}/releases/${tag}"
test ! -e "${sdfy_release}"
mkdir -p "${sdfy_release}"
cp -a "$(readlink -f "${sdfy_base}/current")/." "${sdfy_release}/"
tar -xzf "${archive}" -C "${sdfy_release}"
apply_schema sdfy smartsdfy "${sdfy_release}"
activate sdfy smart-sdfy 3003 "${sdfy_release}"
pm2 save
