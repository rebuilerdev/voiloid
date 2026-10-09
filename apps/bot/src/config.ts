import { loadEnv } from "@voiloid/shared"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** メインボット（コマンド受付・メッセージ監視） */
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  /** サブボット（同じサーバーの複数 VC で同時に読み上げる。カンマ区切り） */
  SUB_BOT_TOKENS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  /** コマンドを即時反映する開発用サーバー（空ならグローバル登録） */
  DEV_GUILD_ID: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  /** Web GUI の URL（案内メッセージのリンク） */
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(5),
  REDIS_URL: z.url(),
  GATEWAY_INTERNAL_URL: z.url(),
  INTERNAL_API_TOKEN: z.string().min(32),
  /** 1 セッションで待機できる読み上げの最大数（超えたら古いものから捨てる） */
  MAX_QUEUE: z.coerce.number().int().positive().default(30),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(schema, env)
}
