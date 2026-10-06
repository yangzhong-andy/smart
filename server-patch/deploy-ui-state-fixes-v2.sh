#!/usr/bin/env bash
set -Eeuo pipefail

target="${1:?target is required}"
service="${2:?service is required}"
port="${3:?port is required}"
release_name="${4:?release name is required}"
archive="${5:?archive path is required}"

base="/srv/smart-erp/${target}"
current="${base}/current"
previous="${base}/previous"
release="${base}/releases/${release_name}"

test -L "${current}"
test -d "${current}"
test -f "${archive}"
test ! -e "${release}"

old_target="$(readlink -f "${current}")"
mkdir -p "${release}"
cp -a "${current}/." "${release}/"
rm -rf "${release}/.next"
tar -xzf "${archive}" -C "${release}"

cd "${release}"
set -a
source "/etc/smart-erp/${target}.env"
set +a
npm run build

ln -sfn "${old_target}" "${previous}"
ln -sfn "${release}" "${current}"
pm2 restart "${service}" --update-env

healthy=false
for _attempt in {1..10}; do
  if curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${port}/login" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != "true" ]]; then
  echo "Service health check failed on port ${port}" >&2
  exit 1
fi

printf 'released=%s\nprevious=%s\n' "${release}" "${old_target}"
