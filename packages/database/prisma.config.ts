import { existsSync } from "node:fs"

import { defineConfig } from "prisma/config"

// ローカル開発では .env を読む（本番・CI は環境変数を直接渡す）
for (const file of [".env", "../../.env"]) {
  if (existsSync(file)) process.loadEnvFile(file)
}

/**
 * CLI（migrate / studio）用の接続先。
 * アプリケーションは DATABASE_URL（Connection Pooler 可）を使い、
 * Migration は DIRECT_DATABASE_URL（Pooler を経由しない直接接続）を使う。
 */
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    url: url ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
