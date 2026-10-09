# voiloid

Discord の読み上げ Bot サービス（本番版 v1）。Web の管理画面・Control API・Worker Gateway・Discord Bot・音声合成 Worker からなる monorepo です。

## 構成

```
apps/
  web/       Web GUI（Next.js）
  api/       Control API（Fastify）: Discord ログイン・権限確認・設定・Bot プロフィール・利用量
  gateway/   Worker Gateway: Worker の WebSocket 接続・合成ジョブの振り分け・利用記録
  bot/       Discord Bot（discord.js / @discordjs/voice）
  worker/    音声合成 Worker（VOICEVOX / AivisSpeech / COEIROINK の横で動く）
packages/
  shared/    API 契約（Zod）・エンジン定義・声の決定と Worker 選択・読み上げテキスト整形・サービス間プロトコル
  database/  Prisma（PostgreSQL）: schema / migrations / repositories / transactions
```

```
ブラウザ ──https──▶ Caddy ──▶ web（Next.js）
                         ├─▶ api（/api/*）──▶ PostgreSQL / Redis / S3 / Discord
                         └─▶ gateway（/worker, WSS）◀── Worker（各ユーザーのマシン・公式サーバー）
bot ──内部 API──▶ gateway                         └─▶ VOICEVOX など
```

- DB に接続するのは api / gateway / bot だけです（Web GUI と Worker は接続しません）
- 読み上げる声は「投稿者のマイボイス → サーバーのデフォルト音声」の順に決まります。投稿者が使える Worker にそのエンジンが無ければ、デフォルト音声になります（`packages/shared/src/voice/routing.ts`）
- Worker はサーバーに「共有」（全員が使う。管理権限が必要）するか、「自分専用」（参加しているだけのサーバーでも可）で接続します

## 開発

必要なもの: Node.js 24（`.nvmrc`）、Docker

```bash
npm ci
npm run dev:deps           # PostgreSQL / Redis（compose.dev.yaml）
cp packages/database/.env.example packages/database/.env
npm run db:generate
npm run db:migrate         # 開発 DB に Migration を適用
npm run db:seed            # 開発用データ（公式・自鯖 Worker のトークンが表示される）
```

各アプリは `apps/<app>/.env` を用意して `npm run dev -w @voiloid/<app>` で起動します（必要な変数は各アプリの `src/config.ts`）。
Web GUI はモックモード（`NEXT_PUBLIC_USE_MOCK` 未設定）なら Backend なしで動きます。

## テスト

| コマンド | 内容 |
|---|---|
| `npm test` | 単体テスト |
| `npm run test:integration` | 統合テスト（実 PostgreSQL / Redis。`compose.dev.yaml` のテスト専用 DB `voiloid_test` と Redis の DB 15 を使う） |
| `npm run test:coverage` | 両方 + カバレッジの閾値（全体 90%、`packages/shared` は 100%） |
| `npm run test:e2e -w @voiloid/web` | Web GUI の E2E（Playwright。先に `npm run build -w @voiloid/web`） |
| `npm run check` | 書式・Lint・型・テスト（CI と同じ） |

`VOICEVOX_E2E_URL=http://127.0.0.1:50021 npx vitest run --project integration apps/worker` で、実際の VOICEVOX を使った End-to-End も確認できます。

統合テストは DB 名が `_test` で終わる場合だけ実行できます（開発・本番 DB を誤って消さないため）。

## CI / CD

- **CI**（`.github/workflows/ci.yml`）: 書式 / Lint / 型 / 本番依存の脆弱性 → 単体 + 統合テスト（カバレッジ閾値）→ Migration テスト（空の DB に全 Migration、Schema との差分、破壊的変更のレビュー確認）→ E2E → 全イメージの Docker ビルド
- **CD**（`.github/workflows/deploy.yml`）: main の CI が成功したら、本番マシンの self-hosted runner がそのマシンで `scripts/deploy.sh` を実行します（ビルド → バックアップ → Migration → 起動 → 確認、失敗時は直前のバージョンに戻す）
- **Worker イメージ**（`.github/workflows/worker-image.yml`）: `v*` タグで GHCR に公開します
- CodeQL・Dependabot

本番マシンの準備と運用は [docs/operations.md](docs/operations.md) を参照してください。
