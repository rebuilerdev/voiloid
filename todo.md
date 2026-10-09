# voiloid 本番版 実装計画

本番版 完全仕様書 v1.1（DB: PostgreSQL + Prisma 必須）と、frontend で確定した API 契約（`apps/web/services` / `apps/web/types`）を正とする。

## 0. 決定事項

| 項目 | 決定 |
|---|---|
| リポジトリ | ルートで 1 つの monorepo（npm workspaces）。frontend は `apps/web` へ移動し、git 履歴は subtree で取り込む。`prototype/` と旧 `frontend/` は参照用に残し git 管理外 |
| 言語 | TypeScript（ESM）、Node.js 24 |
| DB | PostgreSQL 17 + Prisma ORM 7.10（安定版。`latest` タグは 8.0 RC のため使わない） |
| Validation | Zod 4（API 入力・環境変数・Worker プロトコル） |
| API | Fastify 5 |
| Cache / Session / Queue | Redis 7（ioredis） |
| Object Storage | S3 互換（開発は MinIO） |
| テスト | Vitest。Repository / API / Gateway は実 PostgreSQL・Redis を使う統合テスト |
| CI | GitHub Actions |
| CD | GitHub の main に push → CI 成功 → 本番マシン上の self-hosted runner がそのマシンで `docker compose build` → `prisma migrate deploy` → `up -d` → ヘルスチェック |
| TypeScript | 5.9 系（typescript-eslint が TS 7 に未対応の可能性があるため） |

## 1. 全体構成

```
apps/
  web/       Web GUI（Next.js。既存 frontend を移動）
  api/       Control API（Fastify）: 認証・Discord 権限確認・設定 CRUD・Bot プロフィール・Usage
  gateway/   Worker Gateway（WSS）: Worker 認証・接続管理・合成ジョブの振り分け・Usage 記録
  bot/       Discord Bot（discord.js / @discordjs/voice）: コマンド・メッセージ読み上げ・VC 管理
  worker/    音声合成 Worker（各ユーザーのマシン / 公式サーバーで動く。DB には接続しない）
packages/
  shared/    API 契約の Zod スキーマ・エラーコード・エンジン定義・音声解決 / Worker 選択の純粋ロジック・読み上げテキスト整形
  database/  Prisma schema / migrations / client singleton / repositories / transactions / エラー変換 / seed
```

```
Web GUI ──/api──▶ Control API ──▶ Service ──▶ Repository ──▶ Prisma ──▶ PostgreSQL
Bot ──(internal HTTP)──▶ Worker Gateway ◀──WSS── Worker
Bot / API / Gateway ──▶ Redis（セッション・リアルタイム状態・キャッシュ）
```

- DB に接続するのは api / gateway / bot（信頼された Backend Service）のみ。Worker・Web は接続しない
- 読み上げ音声の決定（マイボイス → サーバーのデフォルト音声、使えないエンジンはデフォルトへ）と Worker の候補選定は `packages/shared` の純粋関数にし、gateway（実際の振り分け）と api（画面の「使えるエンジン」表示）で共用する

## 2. フェーズ

### Phase 0: monorepo 基盤
- [x] git init、frontend の履歴取り込み（subtree）、`apps/web` へ配置
- [x] npm workspaces、tsconfig base（ルート）、ESLint（flat config）、Prettier、Vitest projects（unit / integration）、`.editorconfig` / `.nvmrc`
- [x] 開発用 `compose.dev.yaml`（PostgreSQL / Redis）、テスト用 DB の分離（`voiloid_test`）

### Phase 1: packages/shared
- [x] API 契約の Zod スキーマ（frontend の types と一致させる）、エラーコード、レスポンス形式（`{ data }` / `{ error: { code, message, requestId } }`）
- [x] エンジン定義（VOICEVOX / AivisSpeech / COEIROINK）
- [x] 音声解決・Worker 候補選定（Worker モード / ACL の scope = server・personal / 公式フォールバック）
- [x] 読み上げテキスト整形（URL・カスタム絵文字・コードブロック・辞書置換・最大文字数・長文の扱い）
- [x] Worker ⇄ Gateway プロトコルの Zod スキーマ
- [x] 単体テスト（packages/shared はカバレッジ 100% を必須）

### Phase 2: packages/database
- [x] Prisma schema（仕様書のモデル + 拡張: readingMode、サーバーのデフォルト音声、ACL の scope）。Enum を使える列は Enum
- [x] 初回 migration、client singleton（Hot Reload 対策）、Prisma ログ設定（本番は Query 本文を出さない）
- [x] Repository（guild / guild-settings / bot-profile / user / voice / dictionary / worker / usage / audit）
- [x] Transaction（Worker 登録 / 削除 / トークン再発行 / ACL 更新 / Bot プロフィール確定）
- [x] Prisma エラー → アプリケーションエラー変換（P2002 → CONFLICT、P2025 → NOT_FOUND …）
- [x] 開発用 seed
- [x] 統合テスト（実 PostgreSQL。User / Guild / GuildSettings / Dictionary / Worker / WorkerCredential / ACL / Usage / Audit、Cascade / SetNull / Unique / Soft Delete）

### Phase 3: apps/api（Control API）
- [x] 環境変数の Zod 検証、構造化ログ（pino、秘匿情報の redact）、requestId
- [x] Discord OAuth2（state 検証）→ Redis セッション（httpOnly / Secure / SameSite=Lax Cookie）
- [x] 権限確認（Owner / Administrator / Manage Guild）。ユーザーのギルド一覧は Redis に短時間キャッシュ
- [x] frontend の全エンドポイント（me / guilds / settings / channels / bot-profile / dictionary / workers / voices / preview / usage / status / auth）
- [x] Bot プロフィール: Validation → S3 Upload → Discord API → 成功後に DB Transaction
- [x] Audit Log、Rate Limit、CSRF 対策（Origin 検証）
- [x] 統合テスト（Fastify inject + 実 PostgreSQL / Redis。Discord / S3 / Gateway はテスト用実装に差し替え）

### Phase 4: apps/gateway（Worker Gateway）
- [x] WSS 接続、トークン認証（`wkr_<publicId>.<secret>`、DB には hash のみ）
- [x] hello / heartbeat / engines / result プロトコル、Worker 状態（DB の status・lastSeenAt、Redis のリアルタイム負荷）
- [x] 内部 API（Bot から合成依頼）: 音声解決 → 候補 Worker → 負荷の低い順に送信・失敗時は次へ
- [x] UsageEvent 記録、声一覧（`/api/voices` 用）の集約
- [x] 統合テスト（偽 Worker を WebSocket で接続）

### Phase 5: apps/bot
- [x] `/join` `/leave` `/dict` `/voice`、メッセージ読み上げ、キュー再生
- [x] readingMode = fixed + autoJoin、無人時の自動退出（autoLeaveDelaySeconds）
- [x] Guild 同期（upsert、botInstalled）、VoiceSession 履歴、Redis にリアルタイムのセッション状態
- [x] サブボット（同一サーバーで複数 VC）
- [x] テスト（テキスト整形・コマンド処理・セッション管理を Discord 非依存の層で）

### Phase 6: apps/worker
- [x] TypeScript 化、環境変数（`CONTROL_SERVER` / `WORKER_TOKEN` / `WORKER_ENGINES`）、エンジンアダプタ（VOICEVOX 互換 / COEIROINK）
- [x] 再接続（指数バックオフ）、同時実行数の制限、ヘルスチェック
- [x] テスト（偽エンジン HTTP サーバー）

### Phase 7: apps/web
- [x] 実 API 接続（`NEXT_PUBLIC_USE_MOCK=false`）での動作、Worker の Guild 権限取得の N+1 解消
- [x] 単体テスト（Vitest）と E2E（Playwright、モックモード）

### Phase 8: Docker / 本番構成
- [x] マルチステージ Dockerfile（1 ファイルで全イメージ。非 root 実行。Bot は FFmpeg 不要）
- [x] `compose.yaml`（caddy / web / api / gateway / bot / postgres / redis / migrate / backup、公式Worker + VOICEVOX は profile）
- [x] ヘルスチェック、ログ、バックアップ（pg_dump 定期実行）と復元手順

### Phase 9: CI/CD
- [x] `ci.yml`: install → lint → typecheck → 単体テスト → Migration テスト（空の PostgreSQL に全 migration 適用 → generate の差分なし → schema と migration の差分なし）→ 統合テスト → build → Docker build → E2E
- [x] `deploy.yml`: main の CI 成功後、self-hosted runner（本番マシン）でビルド・migrate deploy・起動・ヘルスチェック
- [x] Dependabot、`npm audit`、ブランチ保護の推奨設定
- [x] README / 運用手順（デプロイ、ロールバック / Forward-fix、バックアップ / リストア）

## 3. 実装メモ・未解決事項（2026-10-09）

### 確認したこと
- `npm run check`（書式・Lint・型・単体 + 統合テスト・カバレッジ）: 422 件成功（実 VOICEVOX のテストは環境変数がある場合のみ）。行 97.5% / 分岐 88.1%（packages/shared は 100%）
- 実際の VOICEVOX ENGINE で Worker → Gateway → 合成の End-to-End
- Web GUI の E2E（Playwright、standalone 出力）8 件
- 本番と同じイメージで compose を起動したスモークテスト: Caddy 経由の Web / API、Discord OAuth へのリダイレクト、`/internal` の非公開、セキュリティヘッダー、管理コマンドで公式Worker 登録 → VOICEVOX で合成 → 利用記録、バックアップ作成と別 DB への復元

### 仕様・契約の追加（frontend の API 契約に加えたもの）
- `GET /api/guilds/:guildId/workers`（サーバーに共有された Worker。Server → Worker の N+1 を解消）
- `GET /api/auth/session-expired`（期限切れ Cookie の削除。ログイン画面とのリダイレクトのループを防ぐ）
- エラーコード `SERVICE_UNAVAILABLE`（503。合成できる Worker がいない等）を Web の型に追加
- DB: `DictionaryEntry.wordKey`（大文字小文字・全角半角を同一視した重複判定）、`WorkerGuildPermission.scope`、`WorkerCredential.revokedAt`、`UsageEvent.workerType`、`GuildSettings` の readingMode とデフォルト音声、`User.discordGlobalName`
- Bot コマンド: `/join` `/leave` `/skip` `/voice` `/dict add|remove|list`（`/dict` は既定で「サーバー管理」権限が必要。サーバー側で変更可）

### 見つけて直した問題
- Next.js の standalone 出力で、proxy.ts の rewrite が再度 proxy を通りリダイレクトがループする → rewrite 済みをリクエストヘッダーで判定
- standalone 出力で `request.url` のホストが実際と異なる → Route Handler のリダイレクトを相対パスに
- docker compose が未設定の変数を空文字で渡す → 環境変数の空文字を未設定として扱う（`loadEnv`）
- Web のサーバー側の API 呼び出しが相対 URL になる → `API_INTERNAL_URL`

### 未解決・要判断
- COEIROINK アダプタは API 仕様に基づく実装で、実機では未確認
- `GuildUserVoiceSettings`（サーバーごとのユーザー音声）は DB と振り分けは対応済みだが、設定する UI / API は無い
- 複数の Gateway プロセスでの水平分散は未対応（v1 は 1 プロセス。Worker の接続はプロセスのメモリで管理）
- Redis の Pub/Sub で設定変更を通知しているため、Redis が落ちている間の変更は最大 30〜60 秒（キャッシュの TTL）遅れて反映される
- オブジェクトストレージ（S3 互換）のサービスは未確定（本番の .env で指定する）。バックアップの別拠点へのコピーも運用で用意する
- Prisma 8 は RC のため 7.10 を使用。8 の安定版が出たら移行手順を確認する

# 運営コンソール（2026-10-09 追加要望）

要望: サービスの運営者も Web で操作できるようにし、使いやすくする（現在は本番マシンでの管理コマンドのみ）。

## 方針
- **運営者の判定**: Control API の環境変数 `OPERATOR_DISCORD_USER_IDS`（Discord のユーザー ID、カンマ区切り）。DB や画面から権限を付け外しできないようにし、権限昇格の経路を作らない
- 運営者以外には運営コンソールの存在を見せない（ナビに出さない、API は 404）
- 運営者の操作はすべて監査ログに残す（`admin.*`）
- 参照のみを基本とし、変更できるのは公式Worker の管理だけ（サーバー・ユーザーの利用停止などは、データモデルに無いため今回は対象外）

## 画面（`/admin`、サイドバーの「運営」グループ。運営者にだけ表示）
- [x] **概要** `/admin`: Bot の状態・応答時間、接続中の Worker（公式 / 自鯖）、導入サーバー数・ユーザー数・自鯖Worker 数、今日と直近 7 日の利用量（公式 / 自鯖）、最近の監査ログ
- [x] **公式Worker** `/admin/workers`: 一覧（状態・エンジン・負荷・レイテンシ・最終通信）、追加（トークンとセットアップ手順を一度だけ表示）、名前変更、トークン再発行、削除（確認ダイアログ）。管理コマンド（admin.js）の代わりに使える
- [x] **サーバー** `/admin/guilds`: 全サーバーの検索・一覧（導入状況・メンバー数・今日の読み上げ数・最終利用）、詳細 `/admin/guilds/:guildId`（読み上げ・Worker 設定の要約、接続された Worker、読み上げ中のセッション、30 日の利用量、監査ログ）
- [x] **ユーザー** `/admin/users`: 検索・一覧（Discord の名前・ID、登録日、自鯖Worker 数、マイボイスの有無）
- [x] **監査ログ** `/admin/audit`: 一覧（操作・実行者・サーバー・対象・日時・内容）、操作の種類・サーバーで絞り込み、続きを読み込む

## API（`/api/admin/*`、運営者のみ。運営者以外は 404）
- `GET /api/me` に `isOperator` を追加
- `GET /api/admin/overview`
- `GET/POST /api/admin/workers`、`PATCH/DELETE /api/admin/workers/:workerId`、`POST /api/admin/workers/:workerId/regenerate-token`
- `GET /api/admin/guilds?query=&cursor=`、`GET /api/admin/guilds/:guildId`
- `GET /api/admin/users?query=&cursor=`
- `GET /api/admin/audit-logs?action=&guildId=&cursor=`
- 一覧はカーソル方式のページング（ID は UUIDv7 で時刻順のため、ID をカーソルにする）

## 作業
- [x] shared: 契約（型・Zod）
- [x] database: 運営用の Repository（全体集計・検索・ページング）+ 統合テスト
- [x] api: 運営者の判定、`/api/admin/*`、監査ログ + 統合テスト（運営者以外は 404、CSRF、監査ログ）
- [x] web: 型・services・モック、サイドバー、各画面（ja / en）、型の契約チェック、E2E
- [x] docs / .env.example / compose に `OPERATOR_DISCORD_USER_IDS`
- [x] `npm run check`・E2E・本番イメージのビルド

# 運営コンソールの拡張: 全部操作できるようにする（2026-10-09 追加要望）

順番: 1. サーバー・2. ユーザー・3. Worker → 4. サービス全体の設定 → 5. 運営者の管理

## 運営者の権限（5. を先に土台として入れる）
| 権限 | できること |
|---|---|
| owner | `.env` の `OPERATOR_DISCORD_USER_IDS`。すべて。Web からは外せない |
| admin | すべて（運営者の管理・サービス全体の設定・ユーザーデータの削除・Bot の退出を含む） |
| editor | サーバー・ユーザー・Worker の変更（利用停止を含む）。運営者の管理・全体設定・データ削除・Bot の退出はできない |
| viewer | 閲覧のみ |
- admin / editor / viewer は Web で追加・変更・削除（Discord のユーザー ID で指定。ログイン前でも登録できる）
- 運営者の操作は監査ログに `admin.*`（利用停止・削除などは理由も）として残す

## 1. サーバー
- [x] 設定・辞書・Bot プロフィールの変更: サーバー管理者向けの画面（`/servers/:id`）を editor 以上の運営者も使えるようにする（参加していないサーバーも可）。監査ログに「運営者による変更」と記録
- [x] 読み上げの強制終了・Bot の退出（admin）: Bot への指示を Redis で送り、結果を待って表示
- [x] 利用停止 / 再開（理由必須）: 停止中は Bot が読み上げない・`/join` できない・Gateway も合成しない・サーバー管理者は設定を変更できない（画面に停止中と表示）
- [x] 接続された自鯖Worker の接続解除

## 2. ユーザー（詳細画面 `/admin/users/:id`）
- [x] マイボイスの変更・解除（API は変更・解除、画面は解除のみ。運営者の声の一覧にはその人の自鯖Worker の声が無いため）
- [x] 強制ログアウト（Web のセッションをすべて無効化）
- [x] 利用停止 / 再開（理由必須）: ログインできない・発言を読み上げない
- [x] 自鯖Worker の操作（名前変更・トークン再発行・接続先の変更・無効化・削除）
- [x] データの削除（admin、理由必須）: Worker を削除し、ユーザーと音声設定を削除（監査ログ・辞書は作成者を空にして残す）

## 3. Worker（`/admin/workers` に「公式」「自鯖」のタブ）
- [x] 全 Worker の一覧（自鯖は検索・ページング・状態での絞り込み、所有者・接続先数）
- [x] メンテナンス（無効化 / 有効化）: 振り分けから外し、接続を切る（削除はしない）
- [x] 強制切断、名前変更、トークン再発行、削除、接続先の変更

## 4. サービス全体の設定（`/admin/system`、admin）
- [x] 上限値: 1 ユーザーの自鯖Worker 数・1 サーバーの辞書登録数・最大文字数の上限
- [x] 新しいサーバーの初期値: デフォルト音声・最大文字数（読み上げ方法は「チャンネル固定」にするとチャンネルの指定が必要になるため、初期値はコマンド呼び出しで固定）
- [x] お知らせ（全ユーザーの画面上部に表示。情報 / 警告）
- [x] 読み上げの一時停止（全サーバー。メンテナンス用）
- [x] スラッシュコマンドの再登録（Bot に指示）

## 5. 運営者の管理（`/admin/operators`、admin）
- [x] 一覧・追加・権限の変更・削除

## DB（Migration は追加のみ・既存データに影響しない）
- `Guild` / `User`: `suspendedAt`・`suspendedReason`・`suspendedByUserId`（Nullable）
- `Operator`: `discordUserId`（PK）・`role`（ADMIN / EDITOR / VIEWER）・作成者・作成日時
- `SystemSettings`: 1 行だけのテーブル（`id = 1` の CHECK 制約）

## Web からはできないようにすること
- `.env` の秘匿情報の変更、DB の復元・Migration・デプロイ、監査ログの編集・削除

## 作業
- [x] DB（schema / migration / repository / 統合テスト）
- [x] shared（契約・Redis のキー・Bot への指示のプロトコル）
- [x] api（権限、運営者によるサーバー操作、ユーザー・Worker・全体設定・運営者の API、お知らせ）+ 統合テスト
- [x] bot（利用停止・一時停止・指示の受信）+ テスト
- [x] gateway（利用停止中のサーバーは合成しない）+ テスト
- [x] web（画面・権限に応じた表示・お知らせ・停止中の表示・モック）+ E2E
- [x] docs・`npm run check`・本番イメージのビルド

---

# 名前の変更: voiloid（2026-10-09）

旧名（表示名 `Yomiage`、パッケージ・イメージ名 `voice-bot`、DB・Redis の `voicebot`）を `voiloid` に統一する。`prototype/` は旧版のため変更しない。

- [x] 表示名: `Yomiage` → `Voiloid`（Web の appName、モックの Bot 名、テストの Bot 名）
- [x] Cookie・ヘッダー・グローバル変数: `yomiage_*` / `x-yomiage-*` / `__yomiage*` → `voiloid_*` など
- [x] パッケージ: `voice-bot` / `@voice-bot/*` → `voiloid` / `@voiloid/*`（package-lock を更新）
- [x] Docker: compose のプロジェクト名・イメージ名、GHCR の Worker イメージ（`voiloid-worker`）、Worker 導入コマンドのコンテナ名
- [x] DB・Redis: `voicebot` → `voiloid`（DB ユーザー・DB 名・テスト DB・バックアップのファイル名・Redis のキーの接頭辞）
- [x] CI/CD・デプロイスクリプト・runner のラベル・docs（`/srv/voiloid`）・README
- [x] 開発環境: 新しい名前で compose.dev を起動し直す（旧ボリューム `voice-bot-dev_postgres-data` は消さずに残す）
- [x] `npm run check`・E2E・本番イメージのビルド

---

# GitHub（rebuilerdev/voiloid）の CI 修正（2026-10-09）

- [x] `npm audit` の失敗: 間接依存を `overrides` で修正版に上げる（`tar` ^7.5.22 ← `@discordjs/opus`、`mysql2` ^3.24.5・`deepmerge-ts` ^8.0.2 ← Prisma）。Bot のイメージで `@discordjs/opus` が読み込めることを確認する
- [x] CodeQL の失敗: 無料プランの非公開リポジトリではコードスキャンを使えないため、公開リポジトリのときだけ実行する

---

# 公式Worker の登録を Web だけにする（2026-10-10）

本番マシンで DB に直接書き込む管理コマンド（`apps/api/src/admin.ts`）を廃止し、公式Worker の登録・トークン再発行・削除は運営コンソール（`/admin/workers`、editor 以上）からだけ行う。誰が操作したかが監査ログ（`admin.worker.*`）に残る。

- [x] `apps/api/src/admin.ts` を削除し、ビルドの入口・`npm run admin`・カバレッジの除外から外す
- [x] docs（7 章）を Web での手順に書き換える
- [x] `npm run check`・API イメージのビルドで `dist/admin.js` が無いことを確認する

注: 本番マシンで Docker を使える人は DB に直接書き込めるため、これは本番マシンへのアクセス制限の代わりにはならない。

---

# ログインページの刷新案（prototype/frontend、2026-10-10）

本番（apps/web）に入れる前に、prototype/frontend で新しいログインページを作って見た目を判断する。

- [x] アイコンの配色（紫 → マゼンタ → ピンク → 白、粒子の質感）を使った 2 カラムのレイアウト（左: ブランドと特徴、右: ログイン）。スマートフォンでは 1 カラム
- [x] ログインボタン・`?next=` の扱いは今のまま。Discord の認可画面に移ること、パスワードを受け取らないことを書く
- [x] prototype の表示名を Voiloid に、ロゴをアイコンの画像にする（ログインページで見比べるため）
- [x] ライト・ダーク、デスクトップ・スマートフォンのスクリーンショットで確認する
- [x] 別案: 案 B（`/login/b`: 中央にまとめ、アイコンを大きな光の球として背景に置く）、案 C（`/login/c`: チャットの発言が読み上げられる様子の見本を見せる）。prototype のみ `/login/*` を公開ページにする

---

# ログインページ: 案 C を本番に採用（2026-10-10）

- [x] apps/web のログインページを案 C（左: キャッチコピー・ログイン、右: 読み上げの様子の見本）に置き換える
- [x] キャッチコピーを「Discordの読み上げを もっとカスタマイズ可能に。」/「Text-to-speech for Discord, fully customizable.」にする（改行は区切りの位置だけ）
- [x] ja / en の文言（説明・注意書き・見本）を追加する。見本の発言・チャンネル名も言語ごとに変える
- [x] E2E にログインページの表示（ja / en）を追加し、ライト・ダーク・スマートフォンのスクリーンショットで確認する

---

# サブボットの参加状況と個別の招待（2026-10-10）

サーバーページで、メインの Bot とサブボットそれぞれがサーバーにいるかを表示し、いない Bot を個別に招待できるようにする。

## DB（Migration は追加のみ・既存データに影響しない）
- `Bot`: Discord のユーザー ID（PK）・役割（MAIN / SUB）・並び順・名前・アバター・有効（今の `.env` に含まれるか）
- `GuildBotMembership`: Bot ×サーバー（Discord のサーバー ID）。Bot を消すと一緒に消える

## 作業
- [x] database: schema・migration・repository（Bot の同期・参加の置き換え / 追加 / 削除・サーバーごとの参加状況）+ 統合テスト
- [x] shared: 招待 URL の権限（メイン: 接続・発言・ニックネーム変更 + コマンド / サブ: チャンネルを見る・接続・発言）と招待 URL の作成、契約（`GuildDetail.bots`・`Guild.subBots`）
- [x] bot: 起動時に全 Bot と参加中のサーバーを同期し、全 Bot の参加・退出を記録する + テスト
- [x] api: サーバー一覧に `subBots`（参加数 / 全体）、詳細に `bots`（役割・名前・アイコン・参加中か・招待 URL）+ 統合テスト
- [x] web: 概要ページに「Bot」の欄（参加中 / 未参加・個別の招待ボタン）、サーバー一覧のカードに未参加のサブボットの表示、モック、ja / en、E2E
- [x] docs: サブボットの追加手順
- [x] `npm run check`・E2E

---

# Bot のプロフィールをサブボットにも反映する（2026-10-10）

サーバーごとのプロフィール（名前・アイコン）を保存したら、そのサーバーにいるサブボットにも同じ内容を反映する。サブボットのトークンは Bot のプロセスだけが持つため、API から Bot に指示して反映する。

- [x] shared: Bot への指示に `sync-profile`（サーバー ID、任意で対象の Bot）を追加
- [x] api: プロフィールの保存（Discord への反映と DB の確定）が成功したら `sync-profile` を送る（結果は待たない。Bot が止まっていても保存は成功させる）
- [x] bot: `sync-profile` で、DB の名前と、メインの Bot のサーバーでのアイコン（Discord の CDN から取得）を、そのサーバーにいるサブボットに反映する。サブボットがサーバーに参加したときにも反映する
- [x] テスト（bot: 反映の内容・対象・失敗時、api: 指示を送ること）、画面の説明文、docs
- [x] `npm run check`・E2E

注: この機能より前に保存したプロフィールは、もう一度保存するか、サブボットを招待し直すと反映される（起動のたびに全サーバーへ反映すると Discord のレート制限にかかるため、起動時には反映しない）。

---

# 公式Worker の詳細ページ・サーバーごとのエンジンのオンオフ（2026-10-10）

## 1. 公式Worker の詳細（`/admin/workers/[workerId]`）
- [x] 情報・エンジン（状態・バージョン）・性能（自動更新）・操作（名前変更・メンテナンス・切断・トークン再発行・削除）。自鯖Worker も同じページで見られる（一覧から開く）
- [x] エンジンのオンオフ（Worker ごと）: 止めたエンジンは振り分け・声の一覧・プレビューに使わない。変更すると Worker を再接続させて反映する
- [x] 担当するサーバー（公式Worker のみ）: 全サーバー（既定）/ 指定したサーバーだけ。指定は既存の接続先（WorkerGuildPermission）を使う

## 2. サーバーごとのエンジンのオンオフ（サーバーの「Voice」タブ、サーバー管理者）
- [x] オフにしたエンジンは、そのサーバーの声の選択肢・読み上げに使わない。マイボイスがオフのエンジンなら、そのサーバーではデフォルト音声で読む
- [x] デフォルト音声に使っているエンジンはオフにできない（API で検証）

## DB（Migration は追加のみ・既存データに影響しない）
- `WorkerEngine.enabled`（既定 true）、`Worker.restrictedToGuilds`（既定 false）、`GuildSettings.disabledEngines`（既定 空）

## 作業
- [x] database: schema・migration・mapper（振り分け用の Worker に停止中のエンジン・担当サーバーを反映）・repository + テスト
- [x] shared: 振り分け（担当サーバーの限定・サーバーで止めたエンジン）+ テスト、契約、通知に `routing`（振り分けの再計算だけ）を追加
- [x] gateway: 停止中のエンジンを振り分け・声の一覧・プレビューから外す、`routing` の通知 + テスト
- [x] api: Worker の詳細・エンジンのオンオフ・担当サーバー、サーバー設定の `disabledEngines` + 統合テスト
- [x] web: Worker の詳細ページ、サーバーの「Voice」タブに「使えるエンジン」、モック、ja / en、E2E
- [x] docs・`npm run check`・E2E

---

# ドキュメントの整理（2026-10-10）

読む人ごとに分け、初めての人でも順に読めば分かるようにする。用語・手順・画面の名前は実際の実装に合わせる。

- [x] `README.md`: Voiloid とは・できること・ドキュメントの案内・全体の仕組み（図）
- [x] `docs/user-guide.md`（利用者: サーバー管理者・メンバー）: Bot の導入、読み上げの始め方、コマンド、各タブの設定、マイボイス、辞書、読み上げのルール、サブボット、よくある質問
- [x] `docs/self-hosted-worker.md`（利用者）: 自鯖Worker とは、登録、起動（Docker）、サーバーへの接続、トークン、困ったとき
- [x] `docs/setup.md`（運営: 初回のみ）: 必要なもの、Discord・ストレージ・GitHub・本番マシンの準備、`.env` の全項目（入手先つき）、初回デプロイと確認
- [x] `docs/operations.md`（運営: 日常）: デプロイ・ロールバック・Migration・バックアップ、運営コンソール、公式Worker、サブボット、ログ、セキュリティ
- [x] `docs/troubleshooting.md`（運営）: これまでに起きたエラーと対処
- [x] `docs/development.md`（開発者）: 構成・仕組み、ローカル開発、テスト、Migration の方針、CI / CD、コードの決まり
- [x] `apps/web/README.md`: create-next-app の雛形を置き換える
