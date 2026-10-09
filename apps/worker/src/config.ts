/**
 * Worker の設定（環境変数）。Web GUI の「Worker を追加」に表示する手順と同じ名前を使う。
 */
import { ENGINE_IDS, loadEnv, type EngineId } from "@voiloid/shared"
import { WORKER_TOKEN_PATTERN } from "@voiloid/shared/protocol"
import { z } from "zod"

const engineList = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(ENGINE_IDS as [EngineId, ...EngineId[]])).min(1))

const schema = z.object({
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Worker Gateway の URL（例: wss://console.example.com/worker） */
  CONTROL_SERVER: z.url().refine((v) => /^wss?:\/\//.test(v), "CONTROL_SERVER must start with ws:// or wss://"),
  /** Web GUI で発行したトークン */
  WORKER_TOKEN: z.string().regex(WORKER_TOKEN_PATTERN, "WORKER_TOKEN is malformed."),
  /** このマシンで動かすエンジン（カンマ区切り） */
  WORKER_ENGINES: engineList,
  /** 同時に合成するジョブの数 */
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
  VOICEVOX_URL: z.url().default("http://127.0.0.1:50021"),
  AIVISSPEECH_URL: z.url().default("http://127.0.0.1:10101"),
  COEIROINK_URL: z.url().default("http://127.0.0.1:50032"),
  /** エンジンの状態を確認する間隔 */
  ENGINE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** 1 ジョブの合成のタイムアウト */
  SYNTHESIS_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  /** Docker のヘルスチェック用（0 で無効）。Gateway に接続中なら 200 */
  HEALTH_PORT: z.coerce.number().int().min(0).default(0),
  /** ws:// を許可する（ローカル開発用）。本番ではトークンを守るため wss:// を使う */
  ALLOW_INSECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(schema, env)
  if (config.CONTROL_SERVER.startsWith("ws://") && !config.ALLOW_INSECURE) {
    throw new Error("CONTROL_SERVER must use wss:// (set ALLOW_INSECURE=true only for local development).")
  }
  return config
}

export function engineUrl(config: Config, engine: EngineId): string {
  switch (engine) {
    case "VOICEVOX":
      return config.VOICEVOX_URL
    case "AivisSpeech":
      return config.AIVISSPEECH_URL
    case "COEIROINK":
      return config.COEIROINK_URL
  }
}
