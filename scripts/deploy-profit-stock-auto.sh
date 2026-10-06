#!/usr/bin/env bash
set -Eeuo pipefail

release="/srv/smart-erp/baxi/releases/20260818T093000Z-e940868"
current="/srv/smart-erp/baxi/current"
previous="/srv/smart-erp/baxi/previous"
archive="/tmp/profit-stock-auto-e940868.tar.gz"

test -f "$archive"
test -L "$current"
test ! -e "$release"
mkdir -p "$release"
tar -xzf "$archive" -C "$release"
cp -a "$current/node_modules" "$release/node_modules"

cd "$release"
set -a
source /etc/smart-erp/baxi.env
set +a
npm run build

old_target="$(readlink -f "$current")"
ln -sfn "$old_target" "$previous"
ln -sfn "$release" "$current"
pm2 restart smart-baxi --update-env
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3001/login >/dev/null
readlink -f "$current"
