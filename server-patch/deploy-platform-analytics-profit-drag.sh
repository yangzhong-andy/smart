#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"
base="/srv/smart-erp/baxi"
service="smart-baxi"
port="3001"
old_release="$(readlink -f "${base}/current")"
new_release="${base}/releases/${tag}"
backup_root="${base}/code-backups"
backup_archive="${backup_root}/${tag}-before.tgz"
pm2_id="$(pm2 id "${service}" | tr -d '[] ' | cut -d, -f1)"
database_url="$(pm2 env "${pm2_id}" | sed -n 's/^DATABASE_URL: //p' | head -1)"

test -d "${old_release}"
test ! -e "${new_release}"
test -f "${archive}"
test -n "${database_url}"
mkdir -p "${backup_root}" "${new_release}"

tar -czf "${backup_archive}" -C "${old_release}" \
  src/app/platforms/shopee/analytics/page.tsx \
  src/app/platforms/mercado-livre/analytics/page.tsx

cp -a "${old_release}/." "${new_release}/"
rm -rf "${new_release}/.next"
tar -xzf "${archive}" -C "${new_release}"

(
  cd "${new_release}"
  DATABASE_URL="${database_url}" npm run build
)

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
  if curl --fail --silent --max-time 5 "http://127.0.0.1:${port}/login" >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [ "${healthy}" != "true" ]; then
  rollback
  exit 1
fi

check_status() {
  local path="$1"
  local kind="$2"
  local status
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "http://127.0.0.1:${port}${path}")"
  if [ "${kind}" = "page" ]; then
    case "${status}" in 200|302|307) ;; *) rollback; echo "unexpected status ${status}: ${path}" >&2; exit 1 ;; esac
  else
    case "${status}" in 200|401|403) ;; *) rollback; echo "unexpected status ${status}: ${path}" >&2; exit 1 ;; esac
  fi
  echo "${path}=${status}"
}

check_status /platforms/shopee/analytics page
check_status /platforms/mercado-livre/analytics page
check_status /api/shopee/analytics api
check_status /api/mercado-livre/analytics api
check_status /api/profit-report api

grep -q 'shopee-analytics-daily-column-order-v1' "${new_release}/src/app/platforms/shopee/analytics/page.tsx"
grep -q 'mercado-livre-analytics-daily-column-order-v1' "${new_release}/src/app/platforms/mercado-livre/analytics/page.tsx"
grep -q 'platform: "MERCADO_LIVRE"' "${new_release}/src/app/platforms/mercado-livre/analytics/page.tsx"

pm2 save
/usr/local/sbin/smart-erp-release-retention

echo "release=${tag}"
echo "current=$(readlink -f "${base}/current")"
echo "previous=$(readlink -f "${base}/previous")"
echo "code_backup=${backup_archive}"
sha256sum \
  "${new_release}/src/app/platforms/shopee/analytics/page.tsx" \
  "${new_release}/src/app/platforms/mercado-livre/analytics/page.tsx"
