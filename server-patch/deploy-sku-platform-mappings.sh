#!/usr/bin/env bash
set -Eeuo pipefail

tag="${1:?release tag is required}"
archive="${2:?patch archive is required}"

prepare_release() {
  local app="$1"
  local service="$2"
  local database="$3"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  local pm2_id
  local database_url

  old_release="$(readlink -f "${base}/current")"
  test -d "$old_release"
  test ! -e "$new_release"
  mkdir -p "$new_release"
  cp -a "${old_release}/." "$new_release/"
  tar -xzf "$archive" -C "$new_release"

  pm2_id="$(pm2 id "$service" | tr -d '[] ' | cut -d, -f1)"
  database_url="$(pm2 env "$pm2_id" | sed -n 's/^DATABASE_URL: //p' | head -1)"
  test -n "$database_url"
  (
    cd "$new_release"
    DATABASE_URL="$database_url" npm run build
  )
  printf '%s\n' "$old_release" > "/tmp/${tag}-${app}.old"
}

activate_release() {
  local app="$1"
  local service="$2"
  local port="$3"
  local base="/srv/smart-erp/${app}"
  local old_release
  local new_release="${base}/releases/${tag}"
  old_release="$(cat "/tmp/${tag}-${app}.old")"

  ln -sfn "$old_release" "${base}/previous.next"
  mv -Tf "${base}/previous.next" "${base}/previous"
  ln -sfn "$new_release" "${base}/current.next"
  mv -Tf "${base}/current.next" "${base}/current"
  pm2 reload "$service"
  for _attempt in $(seq 1 30); do
    curl --fail --silent --max-time 5 "http://127.0.0.1:${port}/login" >/dev/null && return 0
    sleep 1
  done
  ln -sfn "$old_release" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "$service" || true
  return 1
}

rollback_release() {
  local app="$1"
  local service="$2"
  local base="/srv/smart-erp/${app}"
  local old_release="$(cat "/tmp/${tag}-${app}.old")"
  ln -sfn "$old_release" "${base}/current.rollback"
  mv -Tf "${base}/current.rollback" "${base}/current"
  pm2 reload "$service" || true
}

prepare_release baxi smart-baxi smart
prepare_release sdfy smart-sdfy smartsdfy
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
