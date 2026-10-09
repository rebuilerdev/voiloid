/**
 * 統合テストの前処理（Vitest globalSetup）。
 * 空のスキーマに全 Migration を適用する。Migration が壊れていればここで失敗する（Migration Test）。
 */
import { execFileSync } from "node:child_process"

import pg from "pg"

import { assertTestDatabase, assertTestRedis, TEST_DATABASE_URL, TEST_REDIS_URL } from "./env"

export default async function setup() {
  assertTestDatabase(TEST_DATABASE_URL)
  assertTestRedis(TEST_REDIS_URL)

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL })
  await client.connect()
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE")
    await client.query("CREATE SCHEMA public")
  } finally {
    await client.end()
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: new URL("../packages/database", import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
    stdio: ["ignore", "ignore", "inherit"],
  })
}
