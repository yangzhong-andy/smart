#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"
base="/srv/smart-erp/baxi"
service="smart-baxi"
database="smart"
app_role="smart_baxi_app"
migration="20260905110000_add_tiktok_daily_operation_actions"
old_release="$(readlink -f "${base}/current")"
new_release="${base}/releases/${tag}"
backup_root="${base}/code-backups"
backup_archive="${backup_root}/${tag}-before.tgz"
pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"

test -d "${old_release}"
test ! -e "${new_release}"
test -n "${database_url}"
mkdir -p "${backup_root}" "${new_release}"

# Keep a compact immutable copy of every overwritten file in addition to the
# release-level previous symlink used for immediate rollback.
tar -czf "${backup_archive}" -C "${old_release}" \
  src/app/api/tiktok/analytics/route.ts \
  src/app/tiktok/analytics/page.tsx \
  src/app/tiktok/orders/page.tsx \
  src/app/tiktok/shop-analytics/page.tsx \
  src/components/store-marketing/StoreMarketingNav.tsx \
  prisma/schema.prisma

cp -a "${old_release}/." "${new_release}/"
rm -rf "${new_release}/.next"
tar -xzf "${archive}" -C "${new_release}"

(
  cd "${new_release}"
  DATABASE_URL="${database_url}" npm run build
)

if ! runuser -u postgres -- psql -At -d "${database}" \
  -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name = '${migration}' AND finished_at IS NOT NULL" \
  | grep -qx "${migration}"; then
  if ! runuser -u postgres -- psql -At -d "${database}" \
    -c "SELECT to_regclass('\"TikTokDailyOperationAction\"')" | grep -qx '"TikTokDailyOperationAction"'; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" \
      -f "${new_release}/prisma/migrations/${migration}/migration.sql"
  fi
  (
    cd "${new_release}"
    DATABASE_URL="${database_url}" npx prisma migrate resolve --applied "${migration}"
  )
fi

runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "TikTokDailyOperationAction" TO "${app_role}";
SQL

rollback() {
  ln -sfn "${old_release}" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "${service}" --update-env || true
}

ln -sfn "${old_release}" "${base}/previous.next"
mv -Tf "${base}/previous.next" "${base}/previous"
ln -sfn "${new_release}" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"

configured_engine="$(pm2 env "${pm2_id}" | sed -n 's/^PRISMA_QUERY_ENGINE_LIBRARY: //p' | head -1)"
if [ -n "${configured_engine}" ]; then
  release_engine="$(find "${new_release}/node_modules/.prisma/client" -maxdepth 1 -type f -name 'libquery_engine-*.so.node' -print -quit)"
  test -f "${release_engine}"
  if ! (cd "${new_release}" && PRISMA_QUERY_ENGINE_LIBRARY="${release_engine}" pm2 reload "${service}" --update-env); then
    rollback
    exit 1
  fi
elif ! pm2 reload "${service}" --update-env; then
  rollback
  exit 1
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
  rollback
  exit 1
fi

api_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/tiktok/analytics)"
case "${api_status}" in
  200|401|403) ;;
  *) rollback; echo "unexpected analytics API status: ${api_status}" >&2; exit 1 ;;
esac

pm2 save
/usr/local/sbin/smart-erp-release-retention

echo "release=${tag}"
echo "current=$(readlink -f "${base}/current")"
echo "previous=$(readlink -f "${base}/previous")"
echo "code_backup=${backup_archive}"
echo "analytics_api_status=${api_status}"
