# Web コンソール（apps/web）

Voiloid の Web コンソールです。利用者の設定画面（サーバー・Worker・声・利用状況・設定）と、運営コンソール（`/admin`）を含みます。

## 動かす

```bash
npm run dev -w @voiloid/web     # http://localhost:3000（モックで動く）
```

- 既定では **モック**（`lib/mock`）で動き、Backend は要りません
- 本物の Control API に接続する場合は `NEXT_PUBLIC_USE_MOCK=false` と `NEXT_PUBLIC_API_BASE_URL` を設定します

## フォルダ

| パス | 内容 |
|---|---|
| `app/[lang]/` | ページ（`login`、`(console)` 以下に各画面。言語は URL を変えずに Cookie・ブラウザの設定で切り替える） |
| `features/` | 画面ごとの部品（`servers`・`workers`・`admin` など） |
| `components/` | 共通の部品（`ui` は shadcn/ui） |
| `services/` | Control API の呼び出し |
| `types/` | API の型（`contract-check.ts` で `@voiloid/shared` の契約と一致するか確かめる） |
| `lib/i18n/dictionaries/` | 画面の文言（日本語・英語） |
| `lib/mock/` | モックの API とデータ（開発・E2E 用。本番では使わない） |
| `e2e/` | Playwright の E2E |

## テスト

```bash
NEXT_PUBLIC_USE_MOCK=true npm run build -w @voiloid/web
npm run test:e2e -w @voiloid/web
```

全体の説明は [開発ガイド](../../docs/development.md) を参照してください。
