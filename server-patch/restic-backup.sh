#!/usr/bin/env bash
set -Eeuo pipefail

repository="sftp:restic-backup:/opt/restic-data/hk-erp"
password_file="/root/restic-pass-hk-erp"
backup_source="/var/backups/smart-erp/databases/daily"
log_file="/var/log/restic-backup.log"
timestamp="$(date '+%Y%m%d_%H%M%S')"

printf '[%s] 开始远程备份\n' "$timestamp" >> "$log_file"
latest_backup="$(find "$backup_source" -mindepth 1 -maxdepth 1 -type d -name '20*CST' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
if [ -z "$latest_backup" ]; then
  printf '[%s] 没有可用的本地数据库备份\n' "$timestamp" >> "$log_file"
  exit 1
fi
if ! find "$latest_backup" -maxdepth 0 -mmin -1560 | grep -q .; then
  printf '[%s] 最新本地数据库备份已超过 26 小时\n' "$timestamp" >> "$log_file"
  exit 1
fi

/usr/bin/restic -r "$repository" --password-file "$password_file" backup "$latest_backup" >> "$log_file" 2>&1
/usr/bin/restic -r "$repository" --password-file "$password_file" forget --keep-last 30 --prune >> "$log_file" 2>&1
printf '[%s] 远程备份完成\n' "$(date '+%Y%m%d_%H%M%S')" >> "$log_file"
