# 運用手順

## 1. デプロイの準備（初回のみ）

### 本番マシン

1. Docker（Compose v2.20 以上）と Git を入れる
2. 80 / 443 番ポートを開け、`APP_DOMAIN` の DNS をこのマシンに向ける（Caddy が HTTPS 証明書を自動で取得する）
3. 環境変数ファイルを置く（リポジトリには置かない。権限は `600`）

   ```bash
   sudo mkdir -p /srv/voiloid/backups
   sudo cp .env.example /srv/voiloid/.env   # 値を埋める
   sudo chmod 600 /srv/voiloid/.env
   ```

   - `BACKUP_DIR=/srv/voiloid/backups` のように絶対パスにする
   - 秘匿値は `openssl rand -base64 32` などで生成する

4. GitHub Actions の self-hosted runner を登録する（Settings → Actions → Runners）。ラベルに `voiloid-production` を付け、runner のユーザーを `docker` グループに入れる

### GitHub リポジトリ

- Settings → Environments に `production` を作る（必要なら承認者を設定）
- Settings → Variables に次を登録する
  - `DEPLOY_ENV_FILE` = `/srv/voiloid/.env`
  - `DEPLOY_STATE_DIR` = `/srv/voiloid/state`
- ブランチ保護（main）: Pull Request 必須、CI の全ジョブ（Static checks / Tests / Migrations / E2E / Docker build）の成功を必須、Force push 禁止
- GHCR の Worker イメージ（`voiloid-worker`）を公開にする

### Discord Developer Portal

- OAuth2 → Redirects に `https://<APP_DOMAIN>/api/auth/callback`
- Bot → Privileged Gateway Intents の **Message Content Intent** を有効にする
- スラッシュコマンドの登録（コマンド定義を変えたときだけ）:

  ```bash
  docker compose --env-file /srv/voiloid/.env run --rm bot node dist/scripts/deploy-commands.js
  ```

  ※ `apps/bot` の `npm run deploy-commands` でも登録できる（`DEV_GUILD_ID` を指定するとそのサーバーにだけ即時反映）

## 2. デプロイ

main にマージされ CI が成功すると自動で行われます。手動の場合は Actions の「Deploy」を実行するか、本番マシンで次を実行します。

```bash
DEPLOY_ENV_FILE=/srv/voiloid/.env ./scripts/deploy.sh
```

`scripts/deploy.sh` の流れ:

1. このコミットのイメージを本番マシン上でビルド（タグ = コミット ID）
2. DB のバックアップ（`BACKUP_DIR/pre-deploy-*.dump`）
3. Migration（`prisma migrate deploy`）
4. 起動し、全サービスのヘルスチェックが通るまで待つ
5. Caddy 経由で Control API に届くことを確認
6. 失敗したら直前のバージョンのイメージで起動し直す

## 3. ロールバック / Forward-fix

- **アプリ**: 失敗時は自動で直前のバージョンに戻ります。手動で戻す場合:

  ```bash
  IMAGE_TAG=$(cat /srv/voiloid/state/previous-tag) docker compose --env-file /srv/voiloid/.env up -d --wait
  ```

- **DB**: Migration は戻しません（Forward-fix）。そのため Migration は常に「旧バージョンのアプリでも動く」後方互換な変更にします（下の「Migration の方針」）。
  どうしても戻す必要がある場合は、デプロイ前のバックアップから復元します（「5. バックアップと復元」）。

## 4. Migration の方針

- Schema の変更は必ず `npm run db:migrate`（`prisma migrate dev`）で Migration を作り、Pull Request でレビューする（`schema.prisma` と `migration.sql`）
- 本番では `prisma migrate deploy` だけを使う。`prisma migrate dev` と `prisma db push` は使わない
- 破壊的な変更は段階的に行う: Nullable で追加 → アプリ更新 → Backfill → 制約追加 → 旧列削除
- CI（`scripts/check-migrations.mjs`）は列・テーブルの削除、型変更、既定値なしの NOT NULL 追加などを検出して失敗させます。意図的な場合は `migration.sql` に `-- migration-review: <理由>` を書き、レビューで確認します
- CHECK 制約など Prisma Schema で表せない制約は `migration.sql` に手で追記する（初回 Migration を参照）

## 5. バックアップと復元

- `backup` サービスが `BACKUP_INTERVAL_SECONDS`（既定: 1 日）ごとに `pg_dump` し、`BACKUP_RETENTION_DAYS`（既定: 14 日）を過ぎたものを削除します
- デプロイ前にも自動でバックアップします
- バックアップは同じマシンにあるため、**別の場所（オブジェクトストレージなど）にも定期的にコピーしてください**
- Point-in-Time Recovery が必要な場合は、マネージド PostgreSQL（PITR 対応）の利用か、WAL アーカイブの導入を検討してください

復元:

```bash
DEPLOY_ENV_FILE=/srv/voiloid/.env ./scripts/restore.sh /srv/voiloid/backups/voiloid-<日時>.dump
```

**復元テスト**: 少なくとも月に 1 回、別の環境でバックアップから復元し、アプリが起動することを確認してください。

## 6. 運営コンソール（Web）

`.env` の `OPERATOR_DISCORD_USER_IDS` に Discord のユーザー ID を書くと、その人は **オーナー** になり、Web GUI のサイドバーに「運営」が表示されます（変更後は再デプロイ）。オーナーは運営コンソールの「運営者」から、他の運営者を権限付きで追加できます（再デプロイ不要）。

### 権限

| 権限 | 指定方法 | できること |
|---|---|---|
| 閲覧者 viewer | Web | すべての画面の閲覧のみ |
| 編集者 editor | Web | 閲覧 + サーバー・ユーザー・Worker の操作（下表の「editor」） |
| 管理者 admin | Web | 編集 + Bot の退出・ユーザーデータの削除・サービス設定・コマンドの再登録・運営者の管理 |
| オーナー owner | `.env` | すべて（Web から変更・削除できない） |

- 判定は Control API が行います。運営者以外には運営コンソールの API が 404（存在を明かさない）、権限が足りない操作は 403 を返します
- 自分自身とオーナーは、利用停止・削除・権限の変更ができません

### 画面とできること

| 画面 | 閲覧（viewer） | 操作 |
|---|---|---|
| 概要 `/admin` | Bot の状態、Worker の接続数、導入サーバー数・ユーザー数、利用量、最近の操作 | — |
| Worker `/admin/workers` | 公式Worker / 自鯖Worker（所有者・状態で絞り込み、接続先の数） | editor: 公式Worker の追加、名前変更、メンテナンス（無効化・有効化）、切断、トークン再発行、削除、自鯖Worker の接続先を外す |
| サーバー `/admin/guilds` | 検索、詳細（設定の要約・接続された Worker・セッション・利用量・操作の記録・利用停止の理由） | editor: 設定・辞書・Bot のプロフィールの編集（サーバー管理者と同じ画面）、読み上げの強制終了、利用停止 / 解除（理由が必須）、自鯖Worker の接続を外す。admin: Bot を退出させる（理由が必須） |
| ユーザー `/admin/users` | 検索、詳細（権限・利用停止の理由・マイボイス・ログイン中のセッション数・自鯖Worker） | editor: マイボイスのリセット、強制ログアウト、利用停止 / 解除（理由が必須）、自鯖Worker の操作。admin: データの削除（理由が必須） |
| 監査ログ `/admin/audit` | 操作の種類・サーバーでの絞り込み | — |
| サービス設定 `/admin/system` | 現在の設定 | admin: 上限（自鯖Worker 数・辞書の単語数・最大文字数）、新しいサーバーの初期値、お知らせ（全ユーザーの画面上部に表示）、全サーバーの読み上げの一時停止、スラッシュコマンドの再登録 |
| 運営者 `/admin/operators` | 運営者と権限の一覧 | admin: 追加・権限の変更・削除 |

### 影響

- **サーバーの利用停止**: 読み上げ中のセッションを終了し、Bot はそのサーバーで読み上げ・`/join`・`/dict` を受け付けません。Worker Gateway も合成を拒否します（403）。サーバー管理者の Web 画面には「利用停止中」と表示され、設定は変更できません
- **ユーザーの利用停止**: Web のセッションをすべて破棄し、ログインできなくなります。Bot はそのユーザーのメッセージを読まず、コマンドも受け付けません
- **データの削除**: マイボイス・自鯖Worker（トークンも無効）・ログイン情報を削除します。辞書と監査ログは残り、作成者・実行者は匿名になります
- **読み上げの一時停止**: すべての読み上げセッションを終了し、解除するまで `/join` と自動参加を受け付けません
- **Bot への指示**（読み上げの強制終了・退出・コマンドの再登録）は Redis 経由で Bot に送り、結果を最大 10 秒待ちます。Bot が動いていなければ 503 を返します

### 記録

- 運営者の操作はすべて監査ログに `admin.*` として残ります。利用停止・退出・削除の理由は監査ログの内容（metadata）に記録されます
- 運営コンソールからサーバーの設定・辞書・Bot のプロフィールを変更した場合は、通常の操作名（`guild.settings.update` など）に `asOperator: true` が付きます

### Web からはできないこと

`.env` の秘匿値の変更、DB の復元・Migration・デプロイ、監査ログの編集・削除、メッセージ本文の閲覧（保存していません）。これらはサーバー上で行います（本書の各章を参照）。

## 7. 公式Worker の追加（コマンド）

運営コンソールの「公式Worker」から追加できます。Web を使えない場合は管理コマンドでも操作できます（トークンは表示されたときしか確認できません）。

```bash
docker compose --env-file /srv/voiloid/.env run --rm api node dist/admin.js create-official-worker official-tokyo-01 VOICEVOX,AivisSpeech
docker compose --env-file /srv/voiloid/.env run --rm api node dist/admin.js list-official-workers
docker compose --env-file /srv/voiloid/.env run --rm api node dist/admin.js rotate-official-worker <公開 ID>
docker compose --env-file /srv/voiloid/.env run --rm api node dist/admin.js delete-official-worker <公開 ID>
```

- 同じマシンで動かす場合: `.env` の `OFFICIAL_WORKER_TOKEN` に設定すると、デプロイ時に `official-worker` と `voicevox` も起動します
- 別のマシンで動かす場合: Worker イメージを `CONTROL_SERVER=wss://<APP_DOMAIN>/worker` で起動します

## 8. ログ・状態の確認

```bash
docker compose --env-file /srv/voiloid/.env ps
docker compose --env-file /srv/voiloid/.env logs -f api gateway bot
```

- ログは JSON（pino）。Cookie・トークン・画像データは出力しません
- エラーレスポンスの `requestId` と、api のログの `reqId` が対応します
- Web GUI の Dashboard に Bot の稼働状態と Worker の状態が表示されます

## 9. 本番公開前の確認（仕様書「Production Ready 条件」）

| 項目 | 状態 |
|---|---|
| Prisma Schema Review / Migration Review | Pull Request で実施（CI が破壊的変更を検出） |
| Migration Test | CI（空の DB に全 Migration → Schema との差分なし → Generate → 型検査 → Seed） |
| Rollback / Forward-fix 手順 | 本書 3 |
| Unique / Foreign Key / Cascade / CHECK 制約 | 統合テスト（`packages/database/src/constraints.int.test.ts`） |
| Transaction | 統合テスト（Worker 登録・削除・トークン再発行・接続先・Bot プロフィール） |
| N+1 Query | 振り分け候補・利用可能エンジン・接続先は 1 クエリで取得（`listRoutingCandidates`） |
| DB Connection Pool | 各アプリの `DATABASE_POOL_SIZE`。Pooler を使う場合は `DATABASE_URL` を Pooler、`DIRECT_DATABASE_URL` を直接接続に |
| Prisma Error Mapping | 単体・統合テスト（P2002 → CONFLICT、P2025 → NOT_FOUND、制約違反 → VALIDATION_ERROR など） |
| Backup / Restore | 本書 5（復元テストは運用で定期的に実施） |
