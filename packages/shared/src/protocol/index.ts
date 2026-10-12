/**
 * サービス間の通信プロトコル。
 * - Worker ⇄ Worker Gateway（WebSocket、JSON テキストフレーム）
 * - Bot / Control API → Worker Gateway（内部 HTTP API）
 * どちらも受信側で Zod 検証する。
 */
import { z } from "zod"

import { engineIdSchema, voiceSettingsSchema } from "../contracts"
import { isEngineId } from "../engines"

/**
 * Worker と Gateway の互換性の決まり（古い Worker が混ざっていても動き続けるようにする）。
 * - 機能を足すときは、プロトコルのバージョンを上げずに WORKER_CAPABILITY に足す。
 *   Gateway は、その機能を申告した Worker にだけ使い、申告しない Worker には今までどおりに振る舞う
 * - メッセージに項目を足すときは、省略できる項目にする（受け取る側は知らない項目を無視する）
 * - 知らない種類のメッセージ・知らないエンジンは、エラーにせず無視する
 * - 互換性を保てない変更をするときだけ WORKER_PROTOCOL_VERSION を上げる。
 *   古い Worker を受け付けなくする場合は MIN_WORKER_PROTOCOL_VERSION も上げる（Gateway は理由を付けて切断し、画面に更新を案内する）
 */
export const WORKER_PROTOCOL_VERSION = 1
/** Gateway が受け付ける、いちばん古いプロトコルのバージョン */
export const MIN_WORKER_PROTOCOL_VERSION = 1

export const isSupportedProtocol = (version: number) =>
  version >= MIN_WORKER_PROTOCOL_VERSION && version <= WORKER_PROTOCOL_VERSION

/** WebSocket の close code（4000 番台はアプリケーション定義） */
export const WORKER_CLOSE = {
  /** hello が不正 */
  INVALID_HELLO: 4001,
  /** プロトコルのバージョンに対応していない（Worker の更新が必要） */
  UNSUPPORTED_PROTOCOL: 4002,
  /** Worker が無効化・削除された */
  DISABLED: 4003,
  /** 同じ Worker の新しい接続に置き換えられた */
  REPLACED: 4008,
  /** 運営者が切断した（Worker はすぐに再接続してよい） */
  RECONNECT: 4010,
  /** 一定時間 hello が届かない */
  HELLO_TIMEOUT: 4009,
} as const

const id = z.string().min(1).max(128)
const name = z.string().min(1).max(200)

export const engineReportSchema = z.object({
  engine: engineIdSchema,
  version: z.string().max(64).optional(),
  healthy: z.boolean(),
  speakers: z
    .array(
      z.object({
        id,
        name,
        styles: z.array(z.object({ id, name })).max(200),
      }),
    )
    .max(1000),
})

export type EngineReport = z.infer<typeof engineReportSchema>

/** エンジンの一覧。この版が知らないエンジン（新しい Worker が対応したもの）は、エラーにせず除く */
const isUnknownEngine = (report: unknown) =>
  typeof report === "object" &&
  report !== null &&
  "engine" in report &&
  typeof report.engine === "string" &&
  !isEngineId(report.engine)

const engineReportsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? (value as unknown[]).filter((e) => !isUnknownEngine(e)) : value),
  z.array(engineReportSchema).max(16),
)

/* ---------- Worker → Gateway ---------- */

/** Worker ができること（hello で申告する。古い Worker は申告しない） */
export const WORKER_CAPABILITY = {
  /** Gateway からの configure で、同時処理の数を変えられる */
  configure: "configure",
} as const

/** この版の Worker ができることのすべて。どれかを申告しない Worker は「更新あり」と表示する */
export const WORKER_CAPABILITIES: readonly string[] = Object.values(WORKER_CAPABILITY)

export const workerHelloSchema = z.object({
  type: z.literal("hello"),
  protocolVersion: z.number().int(),
  workerVersion: z.string().max(64),
  maxConcurrency: z.number().int().min(1).max(64),
  engines: engineReportsSchema,
  capabilities: z.array(z.string().max(32)).max(16).optional(),
})

export const workerEnginesSchema = z.object({
  type: z.literal("engines"),
  engines: engineReportsSchema,
})

export const workerResultSchema = z.discriminatedUnion("ok", [
  z.object({
    type: z.literal("result"),
    jobId: z.uuid(),
    ok: z.literal(true),
    /** WAV（base64） */
    audio: z.string().min(1),
    durationMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("result"),
    jobId: z.uuid(),
    ok: z.literal(false),
    error: z.string().max(1000),
  }),
])

export const workerMessageSchema = z.union([workerHelloSchema, workerEnginesSchema, workerResultSchema])

export type WorkerHello = z.infer<typeof workerHelloSchema>
export type WorkerMessage = z.infer<typeof workerMessageSchema>

/* ---------- Gateway → Worker ---------- */

export const synthesizeJobSchema = z.object({
  type: z.literal("synthesize"),
  jobId: z.uuid(),
  engine: engineIdSchema,
  speakerId: id,
  styleId: id,
  text: z.string().min(1).max(2000),
  speed: z.number(),
  pitch: z.number(),
  intonation: z.number(),
})

export const gatewayMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    workerId: z.string(),
    name: z.string(),
    heartbeatIntervalMs: z.number().int(),
  }),
  synthesizeJobSchema,
  z.object({ type: z.literal("refresh") }),
  /** 同時処理の数を変える（capabilities に configure を申告した Worker にだけ送る） */
  z.object({ type: z.literal("configure"), maxConcurrency: z.number().int().min(1).max(64) }),
])

export type SynthesizeJob = z.infer<typeof synthesizeJobSchema>
export type GatewayMessage = z.infer<typeof gatewayMessageSchema>

/* ---------- Worker トークン ---------- */

/**
 * Worker の接続トークン: `wkr_<publicId>.<secret>`
 * DB には secret のハッシュだけを保存する。publicId でレコードを引き、ハッシュを定数時間比較する。
 */
export const WORKER_TOKEN_PATTERN = /^wkr_([A-Za-z0-9]{16,32})\.([A-Za-z0-9_-]{32,128})$/

export function parseWorkerToken(token: string): { publicId: string; secret: string } | null {
  const match = WORKER_TOKEN_PATTERN.exec(token)
  return match?.[1] && match[2] ? { publicId: match[1], secret: match[2] } : null
}

export const formatWorkerToken = (publicId: string, secret: string) => `wkr_${publicId}.${secret}`

/* ---------- 内部 HTTP API（Bot / Control API → Gateway） ---------- */

export const INTERNAL_API_PREFIX = "/internal/v1"

/** Bot → Gateway: メッセージの読み上げ音声を合成する。レスポンスは audio/wav */
export const internalSynthesizeRequestSchema = z.object({
  /** Discord の Guild ID */
  guildId: z.string().regex(/^\d{17,20}$/),
  /** 投稿者の Discord User ID。システムメッセージ（「接続しました」等）は null */
  userId: z
    .string()
    .regex(/^\d{17,20}$/)
    .nullable(),
  text: z.string().min(1).max(2000),
})

export type InternalSynthesizeRequest = z.infer<typeof internalSynthesizeRequestSchema>

/** Control API → Gateway: 声のプレビュー（公式Worker + 本人の自鯖Worker で合成）。userId は User の内部 ID */
export const internalPreviewRequestSchema = z.object({
  userId: z.uuid(),
  voice: voiceSettingsSchema,
  text: z.string().min(1).max(200),
})

export type InternalPreviewRequest = z.infer<typeof internalPreviewRequestSchema>

/** 合成結果のヘッダー */
export const SYNTH_HEADERS = {
  voiceSource: "x-voice-source",
  workerId: "x-worker-id",
  engine: "x-engine",
} as const

/* ---------- Redis のキー ---------- */

const PREFIX = "voiloid"

export const redisKeys = {
  /** Web のログインセッション */
  webSession: (sessionId: string) => `${PREFIX}:web-session:${sessionId}`,
  /** OAuth の state */
  oauthState: (state: string) => `${PREFIX}:oauth-state:${state}`,
  /** ユーザーの Discord ギルド一覧のキャッシュ */
  userGuilds: (discordUserId: string) => `${PREFIX}:user-guilds:${discordUserId}`,
  /** 直近に取得したサーバー一覧（Discord のレート制限のときに使う予備） */
  userGuildsStale: (discordUserId: string) => `${PREFIX}:user-guilds-stale:${discordUserId}`,
  /** サーバーのチャンネル一覧のキャッシュ */
  guildChannels: (discordGuildId: string) => `${PREFIX}:guild-channels:${discordGuildId}`,
  /** Worker のリアルタイム状態（Gateway が更新） */
  workerLive: (workerId: string) => `${PREFIX}:worker-live:${workerId}`,
  /** プロトコルのバージョンが古くて接続を断った Worker（Gateway が書く。画面に更新を案内する） */
  workerRejected: (workerId: string) => `${PREFIX}:worker-rejected:${workerId}`,
  /** サーバーの読み上げセッション（Bot が更新）。hash: botUserId → JSON */
  guildSessions: (discordGuildId: string) => `${PREFIX}:guild-sessions:${discordGuildId}`,
  /** Bot の稼働状態（Bot が定期更新） */
  botHeartbeat: () => `${PREFIX}:bot-heartbeat`,
  /** 設定変更の通知チャンネル（Pub/Sub）。Bot・Gateway がキャッシュを破棄する */
  invalidation: () => `${PREFIX}:invalidate`,
  /** Control API → Bot の指示（Pub/Sub） */
  botCommands: () => `${PREFIX}:bot-commands`,
  /** Bot の指示の結果（Bot が書き、Control API が待つ） */
  botCommandResult: (id: string) => `${PREFIX}:bot-command-result:${id}`,
  /** ユーザーのログイン中のセッション（強制ログアウト用） */
  userSessions: (userId: string) => `${PREFIX}:user-sessions:${userId}`,
  /** レート制限 */
  rateLimit: (bucket: string) => `${PREFIX}:rate:${bucket}`,
} as const

/** Redis の Worker リアルタイム状態 */
export const workerLiveSchema = z.object({
  status: z.enum(["online", "busy", "degraded"]),
  runningJobs: z.number().int().nonnegative(),
  queue: z.number().int().nonnegative(),
  maxConcurrency: z.number().int().positive(),
  /** 同時処理の数を Web から変えられる（Worker が configure に対応している） */
  configurable: z.boolean().optional(),
  /** この版の Worker ができることのうち、申告していないものがある（更新すると使える） */
  outdated: z.boolean().optional(),
  latencyMs: z.number().nonnegative().optional(),
  lastSeenAt: z.iso.datetime(),
})

export type WorkerLive = z.infer<typeof workerLiveSchema>

/** Redis の、接続を断った Worker の記録 */
export const workerRejectedSchema = z.object({
  protocolVersion: z.number().int(),
  workerVersion: z.string().max(64),
  at: z.iso.datetime(),
})

export type WorkerRejected = z.infer<typeof workerRejectedSchema>

/** Redis の読み上げセッション */
export const guildSessionSchema = z.object({
  botUserId: z.string(),
  textChannelId: z.string(),
  textChannelName: z.string(),
  voiceChannelId: z.string(),
  voiceChannelName: z.string(),
  startedAt: z.iso.datetime(),
})

export type GuildSessionState = z.infer<typeof guildSessionSchema>

/** 設定変更の通知（Pub/Sub）。guildId / userId は Discord の ID、workerId は公開 ID */
export const invalidationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guild"), guildId: z.string() }),
  z.object({ kind: z.literal("user"), userId: z.string() }),
  /** Worker の設定が変わった。reconnect = true なら Gateway は切断して再接続させる（運営者の「切断」） */
  z.object({ kind: z.literal("worker"), workerId: z.string(), reconnect: z.boolean().optional() }),
  /** サービス全体の設定（一時停止・上限値など） */
  z.object({ kind: z.literal("system") }),
  /** 振り分けの再計算だけ（公式Worker の担当サーバーの変更など。Worker は切断しない） */
  z.object({ kind: z.literal("routing") }),
])

/** Control API → Bot の指示（運営コンソールから） */
export const botCommandSchema = z.discriminatedUnion("kind", [
  /** サーバーの読み上げを終了する */
  z.object({ kind: z.literal("stop-sessions"), id: z.uuid(), guildId: z.string() }),
  /** Bot（サブボットを含む）をサーバーから退出させる */
  z.object({ kind: z.literal("leave-guild"), id: z.uuid(), guildId: z.string() }),
  /** スラッシュコマンドを登録し直す */
  z.object({ kind: z.literal("register-commands"), id: z.uuid() }),
  /** サーバーのプロフィール（名前・アイコン）をサブボットにも反映する。botUserId を指定するとその Bot だけ */
  z.object({ kind: z.literal("sync-profile"), id: z.uuid(), guildId: z.string(), botUserId: z.string().optional() }),
])

export type BotCommand = z.infer<typeof botCommandSchema>

export const botCommandResultSchema = z.object({ ok: z.boolean(), message: z.string().max(500).optional() })

export type Invalidation = z.infer<typeof invalidationSchema>
