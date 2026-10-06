#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"
base="/srv/smart-erp/baxi"
service="smart-baxi"
database="smart"
app_role="smart_baxi_app"
migration="20260904033000_add_mercado_livre_advertising"
old_release="$(readlink -f "${base}/current")"
new_release="${base}/releases/${tag}"
pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"

test -d "${old_release}"
test ! -e "${new_release}"
test -n "${database_url}"
mkdir -p "${new_release}"
cp -a "${old_release}/." "${new_release}/"
rm -rf "${new_release}/.next"
tar -xzf "${archive}" -C "${new_release}"

if ! runuser -u postgres -- psql -At -d "${database}" \
  -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name = '${migration}' AND finished_at IS NOT NULL" \
  | grep -qx "${migration}"; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" \
    -f "${new_release}/prisma/migrations/${migration}/migration.sql"
  (
    cd "${new_release}"
    DATABASE_URL="${database_url}" npx prisma migrate resolve --applied "${migration}"
  )
fi

runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "${database}" <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "MercadoLivreAdvertisingAccount",
  "MercadoLivreAdvertisingDaily"
TO "${app_role}";
SQL

(
  cd "${new_release}"
  DATABASE_URL="${database_url}" npm run build
)

ln -sfn "${old_release}" "${base}/previous.next"
mv -Tf "${base}/previous.next" "${base}/previous"
ln -sfn "${new_release}" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"

rollback() {
  ln -sfn "${old_release}" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "${service}" --update-env || true
}

configured_engine="$(pm2 env "${pm2_id}" | sed -n 's/^PRISMA_QUERY_ENGINE_LIBRARY: //p' | head -1)"
if [ -n "${configured_engine}" ]; then
  release_engine="$(find "${new_release}/node_modules/.prisma/client" -maxdepth 1 -type f -name 'libquery_engine-*.so.node' -print -quit)"
  test -f "${release_engine}"
  if ! (cd "${new_release}" && PRISMA_QUERY_ENGINE_LIBRARY="${release_engine}" pm2 reload "${service}" --update-env); then rollback; exit 1; fi
else
  if ! pm2 reload "${service}" --update-env; then rollback; exit 1; fi
fi

healthy=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3001/login >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [ "${healthy}" != "true" ]; then rollback; exit 1; fi

install -m 0755 "${new_release}/server-patch/mercado-livre-advertising-sync.sh" /root/mercado-livre-advertising-sync.sh
(
  crontab -l 2>/dev/null | grep -v '/root/mercado-livre-advertising-sync.sh' || true
  echo '20 * * * * /root/mercado-livre-advertising-sync.sh'
) | crontab -

if ! /root/mercado-livre-advertising-sync.sh; then
  echo "warning: initial Mercado Ads sync failed; hourly cron will retry" >&2
fi
pm2 save
/usr/local/sbin/smart-erp-release-retention

runuser -u postgres -- psql -At -d "${database}" -c \
  'SELECT (SELECT count(*) FROM "MercadoLivreAdvertisingAccount"), (SELECT count(*) FROM "MercadoLivreAdvertisingDaily");'
echo "release=${tag}"
echo "current=$(readlink -f "${base}/current")"
echo "previous=$(readlink -f "${base}/previous")"
