#!/usr/bin/env bash
set -Eeuo pipefail

backup_root="/var/backups/smart-erp/databases/daily"
run_id="$(date +%Y%m%dT%H%M%SCST)"
staging="${backup_root}/.${run_id}.staging"
destination="${backup_root}/${run_id}"

install -d -m 0700 "$backup_root" "$staging"
trap 'rm -rf -- "$staging"' EXIT

runuser -u postgres -- pg_dump -Fc -d smart > "${staging}/smart.dump"
runuser -u postgres -- pg_dump -Fc -d smartsdfy > "${staging}/smartsdfy.dump"
chmod 0600 "${staging}/smart.dump" "${staging}/smartsdfy.dump"
(
  cd "$staging"
  sha256sum smart.dump smartsdfy.dump > SHA256SUMS
)
mv "$staging" "$destination"
trap - EXIT

mapfile -t old_backups < <(
  find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20*CST' -printf '%f\n' \
    | sort -r \
    | tail -n +4
)
for name in "${old_backups[@]}"; do
  [[ "$name" =~ ^20[0-9]{6}T[0-9]{6}CST$ ]] || continue
  target="${backup_root}/${name}"
  [[ "$(readlink -f "$target")" == "${backup_root}/"* ]] || exit 1
  rm -rf -- "$target"
done

echo "$destination"
cat "${destination}/SHA256SUMS"
