/**
 * 環境変数の検証。不足・不正があれば起動時に失敗させる。
 */
import { loadEnv } from "@voiloid/shared"
import { z } from "zod"

const bool = z.enum(["true", "false"]).transform((v) => v === "true")

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  /** Web GUI の公開 URL（OAuth のリダイレクト先・CSRF の Origin 検証に使う） */
  APP_ORIGIN: z.url(),
  /** 本番では true（Cookie に Secure 属性を付ける） */
  COOKIE_SECURE: bool.default(true),
  /** ログイン状態の有効期間（秒） */
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /** Discord のトークンを Redis に保存する際の暗号化キー（32 バイトを base64 で） */
  SESSION_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "SESSION_ENCRYPTION_KEY must be 32 bytes (base64)."),
  /** 監査ログの IP ハッシュ用ソルト */
  IP_HASH_SALT: z.string().min(16),

  DATABASE_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.url(),

  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_API_BASE: z.url().default("https://discord.com/api/v10"),

  /** Worker Gateway の内部 API */
  GATEWAY_INTERNAL_URL: z.url(),
  INTERNAL_API_TOKEN: z.string().min(32),

  /** S3 互換ストレージ（Bot アバターの原本保存） */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(false),

  /** 利用量の日別集計の区切り */
  USAGE_TIME_ZONE: z.string().default("Asia/Tokyo"),
  /** サービスの運営者（運営コンソールを使える Discord ユーザー ID。カンマ区切り） */
  OPERATOR_DISCORD_USER_IDS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\d{17,20}$/, "OPERATOR_DISCORD_USER_IDS must be Discord user IDs."))),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(schema, env)
}
