/**
 * 統合テストの接続先。本番・開発とは完全に分離する。
 * CI では環境変数で指定し、ローカルでは compose.dev.yaml のテスト用 DB / Redis（DB 15）を使う。
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://voiloid:voiloid@127.0.0.1:5433/voiloid_test"

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6380/15"

/** 誤って開発・本番 DB を消さないよう、DB 名が _test で終わる場合だけ許可する */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, "")
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to use "${name}" for integration tests: the database name must end with "_test".`)
  }
}

export function assertTestRedis(url: string): void {
  const db = new URL(url).pathname.replace(/^\//, "")
  if (db !== "15" && process.env.CI !== "true") {
    throw new Error("Refusing to use Redis for integration tests: use logical database 15 (redis://host:port/15).")
  }
}
