#!/usr/bin/env bash
# 本番デプロイ（本番マシン上で実行する。GitHub Actions の self-hosted runner から呼ばれる）
#
#   1. このコミットのイメージを本番マシン上でビルドする
#   2. Migration 前に DB をバックアップする
#   3. Migration を適用する（prisma migrate deploy）
#   4. 新しいイメージで起動し、ヘルスチェックが通るまで待つ
#   5. 外部から確認する（Caddy → Control API）
#   失敗したら、直前に動いていたイメージで起動し直す（DB の Migration は戻さない: Forward-fix）
#
# 環境変数:
#   DEPLOY_ENV_FILE   本番の .env のパス（既定: ./.env）
#   DEPLOY_STATE_DIR  デプロイの記録を置くディレクトリ（既定: ~/.voiloid-deploy）
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${DEPLOY_ENV_FILE:-.env}"
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.voiloid-deploy}"
[[ -f "$ENV_FILE" ]] || { echo "env file not found: $ENV_FILE" >&2; exit 1; }
mkdir -p "$STATE_DIR"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

NEW_TAG="$(git rev-parse --short=12 HEAD)"
PREVIOUS_TAG="$(cat "$STATE_DIR/deployed-tag" 2>/dev/null || true)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

log() {
  echo "[deploy $(date -u +%H:%M:%S)] $*"
}

log "deploying $NEW_TAG (previous: ${PREVIOUS_TAG:-none})"

# 1. ビルド
IMAGE_TAG="$NEW_TAG" compose --profile tools --profile official-worker build

# 2. Migration 前のバックアップ（DB が動いている場合）
if compose ps --status running --services | grep -qx postgres; then
  mkdir -p "$BACKUP_DIR"
  backup="$BACKUP_DIR/pre-deploy-$NEW_TAG-$(date -u +%Y%m%dT%H%M%SZ).dump"
  log "backing up the database to $backup"
  compose exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup.partial"
  mv "$backup.partial" "$backup"
fi

# 3. Migration（後方互換な変更だけを含める方針。旧バージョンも新しいスキーマで動く）
log "applying migrations"
compose up -d --wait postgres redis
IMAGE_TAG="$NEW_TAG" compose --profile tools run --rm migrate

# 4. 起動（ヘルスチェックが通るまで待つ）
rollback() {
  if [[ -z "$PREVIOUS_TAG" ]]; then
    log "deploy failed and there is no previous version to roll back to"
    exit 1
  fi
  log "deploy failed; rolling back to $PREVIOUS_TAG"
  IMAGE_TAG="$PREVIOUS_TAG" compose up -d --remove-orphans --wait --wait-timeout 300 || true
  exit 1
}

log "starting services"
profiles=()
[[ -n "${OFFICIAL_WORKER_TOKEN:-}" ]] && profiles+=(--profile official-worker)
IMAGE_TAG="$NEW_TAG" compose "${profiles[@]}" up -d --remove-orphans --wait --wait-timeout 300 || rollback

# 5. 外部からの確認: Caddy 経由で Control API に届くこと（未ログインなら 401）
log "smoke test"
status=""
for _ in $(seq 1 20); do
  status="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$APP_DOMAIN:443:127.0.0.1" "https://$APP_DOMAIN/api/status" || true)"
  [[ "$status" == "401" ]] && break
  sleep 3
done
[[ "$status" == "401" ]] || { log "smoke test failed (status: $status)"; rollback; }

echo "$NEW_TAG" > "$STATE_DIR/deployed-tag"
[[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$NEW_TAG" ]] && echo "$PREVIOUS_TAG" > "$STATE_DIR/previous-tag"

# 古いイメージを削除する（現在と直前のバージョンは残す）
for app in api gateway bot web worker migrate; do
  docker image ls "voiloid/$app" --format '{{.Tag}}' \
    | grep -vx -e "$NEW_TAG" -e "${PREVIOUS_TAG:-__none__}" -e latest \
    | xargs -r -I{} docker image rm "voiloid/$app:{}" >/dev/null 2>&1 || true
done

log "deployed $NEW_TAG"
