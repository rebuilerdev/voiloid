#!/bin/sh
# PostgreSQL のバックアップを一定間隔で取得し、保持期間を過ぎたものを削除する。
# 復元は scripts/restore.sh を使う。
set -eu

interval="${BACKUP_INTERVAL_SECONDS:-86400}"
retention="${BACKUP_RETENTION_DAYS:-14}"

while true; do
  file="/backups/voiloid-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "backup created: $file"
  else
    rm -f "$file.partial"
    echo "backup failed" >&2
  fi
  find /backups -name 'voiloid-*.dump' -mtime +"$retention" -delete
  sleep "$interval"
done
