#!/usr/bin/env bash
set -Eeuo pipefail

log_file="/var/log/mercado-livre-webhook-process.log"
exec 9>/run/lock/smart-erp-mercado-livre-webhook-process.lock
flock -n 9 || exit 0

# Process several pages so a brief outage drains automatically. The API is
# idempotent: processed and ignored rows are not selected again.
for batch in $(seq 1 4); do
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  if result="$(/usr/local/sbin/smart-erp-api-post baxi 3001 /api/mercado-livre/webhook/process '{}' 120 2>&1)"; then
    printf '[%s] batch=%s OK: %.1000s\n' "$timestamp" "$batch" "$result" >> "$log_file"
    processed="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("processed", -1))' 2>/dev/null || printf '%s' -1)"
    [ "$processed" = "0" ] && break
  else
    printf '[%s] batch=%s FAIL: %.1000s\n' "$timestamp" "$batch" "$result" >> "$log_file"
    exit 1
  fi
done
