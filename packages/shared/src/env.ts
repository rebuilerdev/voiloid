/**
 * 環境変数の検証（各アプリの config.ts で使う）。
 * - 空文字は未設定として扱う（docker compose の `${VAR:-}` は未設定の変数を空文字で渡すため）
 * - エラーには項目名と理由だけを出し、値（秘匿情報）は出さない
 */
import type { z } from "zod"

export function loadEnv<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.infer<T> {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""))
  const result = schema.safeParse(present)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Invalid environment variables:\n${issues}`)
  }
  return result.data
}
