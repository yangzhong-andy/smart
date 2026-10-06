#!/usr/bin/env bash
set -Eeuo pipefail

tag="20260901T160200-warehouse-multiplatform"
base="/srv/smart-erp/baxi"
service="smart-baxi"
expected_old="/srv/smart-erp/baxi/releases/20260901T140500-platform-date-filter"
new_release="${base}/releases/${tag}"
migration="20260901173000_add_platform_to_warehouse_fund_ledger"
pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"
old_release="$(readlink -f "${base}/current")"

test "${old_release}" = "${expected_old}"
test -d "${new_release}/.next"
test -n "${database_url}"
test -f "${new_release}/prisma/migrations/${migration}/migration.sql"

before_audit="$(runuser -u postgres -- psql -d smart -Atc 'SELECT COUNT(*) || '\''|'\'' || COALESCE(SUM("amount"), 0) FROM "WarehouseFundEntry";')"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 --single-transaction -d smart \
  -f "${new_release}/prisma/migrations/${migration}/migration.sql"

(
  cd "${new_release}"
  DATABASE_URL="${database_url}" npx prisma migrate resolve --applied "${migration}"
)

after_audit="$(runuser -u postgres -- psql -d smart -Atc 'SELECT COUNT(*) || '\''|'\'' || COALESCE(SUM("amount"), 0) FROM "WarehouseFundEntry";')"
if [ "${before_audit}" != "${after_audit}" ]; then
  echo "warehouse ledger audit changed unexpectedly: before=${before_audit} after=${after_audit}" >&2
  exit 1
fi

ln -sfn "${old_release}" "${base}/previous.next"
mv -Tf "${base}/previous.next" "${base}/previous"
ln -sfn "${new_release}" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"

configured_engine="$(pm2 env "${pm2_id}" | sed -n 's/^PRISMA_QUERY_ENGINE_LIBRARY: //p' | head -1)"
if [ -n "${configured_engine}" ]; then
  release_engine="$(find "${new_release}/node_modules/.prisma/client" -maxdepth 1 -type f -name 'libquery_engine-*.so.node' -print -quit)"
  test -f "${release_engine}"
  (
    cd "${new_release}"
    PRISMA_QUERY_ENGINE_LIBRARY="${release_engine}" pm2 reload "${service}" --update-env
  )
else
  pm2 reload "${service}"
fi

healthy=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3001/login >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "${healthy}" != "true" ]; then
  ln -sfn "${old_release}" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "${service}" || true
  exit 1
fi

pm2 save
/usr/local/sbin/smart-erp-release-retention

echo "release=${tag}"
echo "ledger_audit=${after_audit}"
echo "current=$(readlink -f "${base}/current")"
echo "previous=$(readlink -f "${base}/previous")"
