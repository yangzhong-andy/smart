#!/usr/bin/env bash
set -euo pipefail

app_root="/srv/smart-erp/sdfy/current"
database_url="$(node -e "const c=require('/root/ecosystem.config.js'); const a=c.apps.find((x)=>x.name==='smart-sdfy'); if(!a?.env?.DATABASE_URL) process.exit(2); process.stdout.write(a.env.DATABASE_URL)")"

export DATABASE_URL="$database_url"
export YYT_CLI_PATH="/usr/local/bin/yyt-cli"
export YYT_ADVERTISING_CURRENCY="USD"

cd "$app_root"
exec ./node_modules/.bin/tsx scripts/sync-yyt-advertising.ts --days "${1:-2}"
