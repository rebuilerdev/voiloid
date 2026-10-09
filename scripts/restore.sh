#!/usr/bin/env bash
# PostgreSQL をバックアップから復元する（本番マシン上で実行する）。
#
#   DEPLOY_ENV_FILE=/srv/voiloid/.env DEPLOY_STATE_DIR=/srv/voiloid/state ./scripts/restore.sh <バックアップ>.dump
#
# 復元中は読み書きを止めるため、アプリのサービスを停止してから実行し、終わったら起動し直す。
# 定期的に検証用の環境で復元を試し、手順とバックアップが使えることを確認すること（Restore Test）。
set -euo pipefail

cd "$(dirname "$0")/.."

file="${1:?usage: restore.sh <backup.dump>}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env}"
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.voiloid-deploy}"
[[ -f "$file" ]] || { echo "backup not found: $file" >&2; exit 1; }

# 今動いているバージョンのイメージで起動し直す（イメージのタグはコミット ID。latest は無い）
IMAGE_TAG="${IMAGE_TAG:-$(cat "$STATE_DIR/deployed-tag" 2>/dev/null || true)}"
[[ -n "$IMAGE_TAG" ]] || { echo "the deployed version is unknown: set IMAGE_TAG or DEPLOY_STATE_DIR" >&2; exit 1; }
export IMAGE_TAG

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

read -r -p "Restore $file into the production database? All current data will be replaced. Type 'restore' to continue: " answer
[[ "$answer" == "restore" ]] || { echo "aborted"; exit 1; }

echo "stopping application services"
compose stop web api gateway bot

echo "restoring"
compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$file"

echo "starting application services"
compose up -d --wait web api gateway bot
echo "restored from $file"
