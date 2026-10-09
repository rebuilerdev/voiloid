import { loadEnv } from "@voiloid/shared"
import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  HOST: z.string().default("0.0.0.0"),
  /** Worker が接続する WebSocket（リバースプロキシで wss:// として公開する） */
  WORKER_PORT: z.coerce.number().int().positive().default(4100),
  /** Bot / Control API 用の内部 API（外部に公開しない） */
  INTERNAL_PORT: z.coerce.number().int().positive().default(4101),
  INTERNAL_API_TOKEN: z.string().min(32),
  DATABASE_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.url(),
  /** 合成ジョブのタイムアウト */
  JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /** Worker の生存確認の間隔 */
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** 接続後、hello が届くまでの猶予 */
  HELLO_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(schema, env)
}
