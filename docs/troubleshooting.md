# トラブル対応

運営者向けの、よくあるエラーと対処です。エラーのメッセージで探してください。
利用者からの質問は [利用者ガイドの「よくある質問」](user-guide.md#9-よくある質問) も参照してください。

- [デプロイ](#デプロイ)
- [GitHub Actions の runner](#github-actions-の-runner)
- [Web コンソール](#web-コンソール)
- [読み上げ・Bot](#読み上げbot)
- [Worker](#worker)
- [調べ方](#調べ方)

---

## デプロイ

デプロイのログは、GitHub の「Actions」→「Deploy」→ 失敗した実行 →「Deploy to production」で見られます。

### `env file not found: .env`

GitHub の変数 `DEPLOY_ENV_FILE` が登録されていません。
「Settings」→「Secrets and variables」→「Actions」→「Variables」に `DEPLOY_ENV_FILE=/srv/voiloid/.env` と `DEPLOY_STATE_DIR=/srv/voiloid/state` を登録し、もう一度実行します。

### `/srv/voiloid/.env: line N: ...: No such file or directory`

`.env` の N 行目に、シェルが特別に扱う文字（`<`・`>` など）が残っています。よくあるのは、例の値の `<POSTGRES_PASSWORD>` を置き換え忘れている場合です。

```bash
grep -nE '^[^#].*(<|>|example)' /srv/voiloid/.env    # 何も出なければ OK
```

`DATABASE_URL` は `<` と `>` も消して、パスワードに置き換えます。値に `$`・`&`・`"`・スペースも使わないでください。

### `Permission denied`（バックアップの書き込みなど）

デプロイを実行する `actions` ユーザーが、フォルダに書き込めません。sudo で作ったフォルダは root の持ち物になっているためです。

```bash
sudo chown -R actions:actions /srv/voiloid/backups /srv/voiloid/state
sudo chown actions:actions /srv/voiloid/.env && sudo chmod 600 /srv/voiloid/.env
```

この段階で止まった場合、Migration や再起動は行われていないので、本番は前のバージョンのまま動いています。

### `smoke test failed (status: ...)` の後に戻される

起動はしたものの、外から Control API に届きませんでした。

- `APP_DOMAIN` の DNS が本番マシンを向いているか
- 80 番・443 番ポートが外から開いているか（HTTPS の証明書の取得に必要）
- `docker compose --env-file /srv/voiloid/.env logs caddy` に証明書のエラーが出ていないか

### `... is required` / `... must be ...`（起動直後に止まる）

`.env` の必須の項目が空か、形式が違います。ログのメッセージに項目名が出ます。

| メッセージの例 | 原因 |
|---|---|
| `SESSION_ENCRYPTION_KEY must be 32 bytes (base64).` | `openssl rand -base64 32` の出力をそのまま貼っていない |
| `INTERNAL_API_TOKEN` が 32 文字未満 | `openssl rand -base64 32` で作り直す |
| `S3_BUCKET` などが空 | 画像の保存先の設定が必要（[構築 3](setup.md#3-画像の保存先s3-互換ストレージの準備)） |

### `npm audit` で CI が失敗する

依存しているパッケージに脆弱性が見つかりました。修正版があれば `npm update`、間接的な依存なら `package.json` の `overrides` で修正版を指定し、`package-lock.json` を更新します。

---

## GitHub Actions の runner

### `Must not run with sudo`

runner の `config.sh` を root で実行しています。`actions` ユーザーになってから、sudo を付けずに実行します（[構築 6-1](setup.md#6-1-self-hosted-runner-を登録する)）。
途中まで sudo で実行した場合は、そのフォルダを消してからやり直してください。

### Deploy が「待機中（Queued）」のまま

runner がオフラインです。

```bash
cd /srv/voiloid/actions-runner
sudo ./svc.sh status       # 止まっていれば
sudo ./svc.sh start
```

`./run.sh` で動かしていた場合は、ターミナルを閉じると止まります。`svc.sh` でサービスとして登録してください。

---

## Web コンソール

### ログアウトで `Unsupported content type.` と出る

古いバージョンの不具合です（修正済み）。最新のバージョンをデプロイしてください。それまでは、ブラウザで Voiloid の Cookie を削除するとログアウトできます。

### 「ダッシュボードの読み込みに失敗しました」と、ときどき出る

古いバージョンの不具合です（修正済み）。ページが同時に読み込む複数の API が、それぞれ Discord に「参加しているサーバーの一覧」を問い合わせ、Discord のレート制限（429）にかかっていました。今は同時の問い合わせを 1 回にまとめ、429 のときは直近（10 分以内）の一覧を使います。最新のバージョンをデプロイしてください。

### 「Discordでログイン」の後にエラーになる

- Developer Portal の「OAuth2」→「Redirects」に `https://<ドメイン>/api/auth/callback` が **完全に同じ文字列で** 登録されているか
- `.env` の `DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET` が正しいか（Reset Secret した後に `.env` を更新し忘れていないか）

### サイドバーに「運営」が出ない

`.env` の `OPERATOR_DISCORD_USER_IDS` に自分の Discord ユーザー ID が入っているか確認し、変えた場合は再デプロイします。他の運営者は、オーナーが「運営者」画面から追加します。

---

## 読み上げ・Bot

### コマンド（`/join` など）が Discord に出ない

スラッシュコマンドが登録されていません。運営コンソールの「サービス設定」→「スラッシュコマンドの再登録」を押します（[構築 7](setup.md#7-初回のデプロイ)）。反映まで数分かかることがあります。

### `/join` しても読み上げない

- 運営コンソールの「サービス設定」で、読み上げが一時停止されていないか
- そのサーバー・ユーザーが利用停止されていないか
- オンラインの Worker があるか（運営コンソールの「Worker」）。サーバーの「Worker」タブの設定（公式のみ・Worker を指定 など）で使える Worker が無い場合も読みません
- Developer Portal で **Message Content Intent** がオンか（オフだと本文を受け取れません）

### サブボットが入らない・プロフィールが反映されない

- サブボットがそのサーバーに招待されているか（サーバーの「Overview」→「Bot」）
- ボイスチャンネルで「接続」「発言」の権限があるか
- プロフィールの反映には「ニックネームの変更」の権限が必要です。反映に失敗すると、Bot のログに `failed to sync the bot profile` が出ます

---

## Worker

### Worker が「オフライン」のまま

Worker のマシンでログを確認します。

```bash
docker compose logs -f worker
```

| ログ | 原因と対処 |
|---|---|
| `connected to the gateway` | 接続できています。画面の表示が変わるまで数秒待ってください |
| `reconnecting` を繰り返す | トークンが違う・再発行された・Worker が削除された・メンテナンス中。運営コンソールで確認し、必要ならトークンを再発行して `.env` を書き換えます |
| `WORKER_TOKEN is malformed.` | トークンの貼り付けが途中で切れている |
| `CONTROL_SERVER must start with ws:// or wss://` | `CONTROL_SERVER` は `wss://<ドメイン>/worker` |

### エンジンが「Unhealthy」

- 音声合成ソフト（コンテナ）が起動しているか: `docker compose ps`
- `VOICEVOX_URL` などの URL とポートが合っているか
- 起動直後は、モデルの読み込みに 1〜2 分かかることがあります
- `WORKER_ENGINES` に、動かしていないエンジンを書いていないか

### `docker pull` で `denied` / `unauthorized`

GHCR の Worker のイメージが非公開です。公開するか（[構築 6-4](setup.md#6-4-自鯖worker-のイメージを公開する自鯖worker-を使う場合)）、ソースからビルドします（[運用 5-2](operations.md#5-2-起動する)）。

---

## 調べ方

```bash
sudo -iu actions
cd /srv/voiloid/actions-runner/_work/voiloid/voiloid
docker compose --env-file /srv/voiloid/.env ps                                  # どのサービスが止まっているか
docker compose --env-file /srv/voiloid/.env logs --tail 200 api gateway bot     # 直近のログ
```

- 利用者の画面に出たエラーの `requestId` で、api のログ（`reqId`）を探せます
- 運営コンソールの「監査ログ」で、誰がいつ何を変えたかを確認できます
