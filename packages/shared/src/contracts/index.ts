/**
 * Web GUI ⇄ Control API の契約。
 * - リクエスト: Zod スキーマ（Control API で検証する）
 * - レスポンス: 型（apps/web/types と同じ形。apps/web からも参照する）
 *
 * PATCH の undefined / null の意味:
 *   undefined = 変更しない / null = 値を消す（既定に戻す）
 */
import { z } from "zod"

import {
  BOT_AVATAR,
  BOT_NICKNAME_LENGTH,
  DICTIONARY_LENGTH,
  MAX_CHARACTERS_RANGE,
  VOICE_PARAM_RANGE,
  VOICE_PREVIEW_TEXT_LENGTH,
  WORKER_CONCURRENCY_RANGE,
  WORKER_NAME_LENGTH,
} from "../constants"
import { ENGINE_IDS, type EngineId } from "../engines"
import type { ErrorCode } from "../errors"

/* ---------- 共通 ---------- */

export type ApiSuccess<T> = { data: T }

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; requestId?: string }
}

/** Discord の Snowflake（URL の guildId など） */
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "Invalid Discord ID.")

const trimmed = (range: { min: number; max: number }) => z.string().trim().min(range.min).max(range.max)

const param = (range: { min: number; max: number }) => z.number().min(range.min).max(range.max)

/* ---------- Voice ---------- */

export const engineIdSchema = z.enum(ENGINE_IDS as [EngineId, ...EngineId[]])

export const voiceSettingsSchema = z
  .object({
    engine: engineIdSchema,
    speakerId: z.string().min(1).max(128),
    styleId: z.string().min(1).max(128),
    speed: param(VOICE_PARAM_RANGE.speed),
    pitch: param(VOICE_PARAM_RANGE.pitch),
    intonation: param(VOICE_PARAM_RANGE.intonation),
  })
  .strict()

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>

/** 利用可能な音声（Speaker × Style 単位） */
export interface Voice {
  engine: string
  speakerId: string
  speakerName: string
  styleId: string
  styleName: string
}

export const voicePreviewRequestSchema = voiceSettingsSchema
  .extend({ text: trimmed(VOICE_PREVIEW_TEXT_LENGTH) })
  .strict()

export type VoicePreviewRequest = z.infer<typeof voicePreviewRequestSchema>

export interface VoicePreview {
  /** 再生可能な音声 URL（data URL を含む） */
  audioUrl: string
}

/* ---------- Me ---------- */

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  /** マイボイス。null = 各サーバーのデフォルト音声 */
  voice: VoiceSettings | null
  /** サービスの運営者（運営コンソールを使える） */
  isOperator: boolean
  /** 運営者の権限（運営者でなければ null） */
  operatorRole: OperatorRole | null
}

export const updateMeRequestSchema = z.object({ voice: voiceSettingsSchema.nullable() }).strict()

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>

export interface MemberGuild {
  id: string
  name: string
  iconUrl?: string
  canManage: boolean
  availableEngines: string[]
}

/* ---------- Guild ---------- */

export type ReadingStatus = "active" | "idle" | "disabled"

export interface Guild {
  id: string
  name: string
  /** 運営者によって利用停止されている */
  suspended?: boolean
  iconUrl?: string
  memberCount?: number
  botInstalled: boolean
  botStatus?: "online" | "offline"
  readingEnabled: boolean
  readingStatus?: ReadingStatus
  voiceName?: string
  lastActiveAt?: string
  /** サブボットの参加状況（サブボットがある場合のみ） */
  subBots?: { present: number; total: number }
}

export interface GuildBot {
  /** Discord のユーザー ID */
  id: string
  name: string
  avatarUrl?: string
  role: "main" | "sub"
  /** サーバーに参加している */
  present: boolean
  inviteUrl: string
}

export interface GuildSession {
  textChannelName: string
  voiceChannelName: string
  connected: boolean
}

export interface GuildDetail extends Guild {
  session?: GuildSession
  currentWorkerName?: string
  messagesReadToday: number
  availableEngines: string[]
  /** 読み上げ Bot（メイン → サブボット）とサーバーへの参加状況 */
  bots: GuildBot[]
}

export interface GuildChannel {
  id: string
  name: string
  type: "text" | "voice"
}

export const readingModeSchema = z.enum(["command", "fixed"])
export type ReadingMode = z.infer<typeof readingModeSchema>

export const longMessageBehaviorSchema = z.enum(["truncate", "skip"])
export type LongMessageBehavior = z.infer<typeof longMessageBehaviorSchema>

export const workerModeSchema = z.enum(["auto", "official", "private_preferred", "specific"])
export type WorkerMode = z.infer<typeof workerModeSchema>

export interface GuildSettings {
  readingMode: ReadingMode
  textChannelId?: string
  voiceChannelId?: string
  autoJoin: boolean
  readUrls: boolean
  maxCharacters: number
  longMessageBehavior: LongMessageBehavior
  workerMode: WorkerMode
  workerId?: string
  fallbackToOfficial: boolean
  voice: VoiceSettings
  /** このサーバーで使わないエンジン（声の選択肢・読み上げから外す） */
  disabledEngines: string[]
}

/**
 * PATCH /api/guilds/:guildId/settings
 * channel / workerId は null で解除できる。voice は必須項目のため null を受け付けない。
 */
export const updateGuildSettingsRequestSchema = z
  .object({
    readingMode: readingModeSchema,
    textChannelId: snowflakeSchema.nullable(),
    voiceChannelId: snowflakeSchema.nullable(),
    autoJoin: z.boolean(),
    readUrls: z.boolean(),
    maxCharacters: z.number().int().min(MAX_CHARACTERS_RANGE.min).max(MAX_CHARACTERS_RANGE.max),
    longMessageBehavior: longMessageBehaviorSchema,
    workerMode: workerModeSchema,
    workerId: z.string().min(1).max(64).nullable(),
    fallbackToOfficial: z.boolean(),
    voice: voiceSettingsSchema,
    disabledEngines: z
      .array(engineIdSchema)
      .max(ENGINE_IDS.length)
      .refine((v) => new Set(v).size === v.length, { message: "disabledEngines must be unique." }),
  })
  .partial()
  .strict()

export type UpdateGuildSettingsRequest = z.infer<typeof updateGuildSettingsRequestSchema>

/* ---------- Bot Profile ---------- */

export interface GuildBotProfile {
  nickname: string | null
  avatarUrl: string | null
  defaultName: string
  defaultAvatarUrl?: string
}

const avatarDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/, "avatar must be a base64 image data URL.")
  .refine((value) => base64Bytes(value.slice(value.indexOf(",") + 1)) <= BOT_AVATAR.maxBytes, {
    message: `avatar must be ${BOT_AVATAR.maxBytes / 1024 / 1024}MB or smaller.`,
  })

export const updateGuildBotProfileRequestSchema = z
  .object({
    nickname: trimmed(BOT_NICKNAME_LENGTH).nullable(),
    avatar: avatarDataUrlSchema.nullable(),
  })
  .partial()
  .strict()

export type UpdateGuildBotProfileRequest = z.infer<typeof updateGuildBotProfileRequestSchema>

/** base64 文字列が表すバイト数 */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/* ---------- Dictionary ---------- */

export interface DictionaryEntry {
  id: string
  word: string
  reading: string
  createdAt: string
}

export const dictionaryEntryInputSchema = z
  .object({
    word: trimmed(DICTIONARY_LENGTH.word),
    reading: trimmed(DICTIONARY_LENGTH.reading),
  })
  .strict()

export type DictionaryEntryInput = z.infer<typeof dictionaryEntryInputSchema>

/* ---------- Worker ---------- */

/** API 上の Worker 状態（DB の DEGRADED は error、DISABLED は offline として返す） */
export type WorkerStatus = "online" | "busy" | "offline" | "error"

export type WorkerType = "official" | "private"

export interface WorkerEngine {
  engine: string
  status: "healthy" | "unhealthy"
  version?: string
}

export interface Worker {
  id: string
  name: string
  type: WorkerType
  status: WorkerStatus
  engines: WorkerEngine[]
  runningJobs: number
  /** 実際に使う同時処理の数 = min(Worker の申告, 上限) */
  maxConcurrency: number
  /** Worker が申告した同時処理の数（Worker の MAX_CONCURRENCY） */
  workerConcurrency?: number
  /** Web で設定した同時処理の上限（無ければ上限なし） */
  concurrencyLimit?: number
  latency?: number
  lastSeenAt?: string
  queue?: number
  createdAt?: string
}

export const createWorkerRequestSchema = z
  .object({
    name: trimmed(WORKER_NAME_LENGTH),
    engines: z.array(engineIdSchema).min(1).max(ENGINE_IDS.length),
  })
  .strict()
  .refine((v) => new Set(v.engines).size === v.engines.length, { message: "engines must be unique." })

export type CreateWorkerRequest = z.infer<typeof createWorkerRequestSchema>

export interface CreateWorkerResponse {
  worker: Worker
  /** 一度だけ返される接続トークン */
  token: string
}

/** 同時処理の上限（null = 上限なし） */
export const concurrencyLimitSchema = z
  .number()
  .int()
  .min(WORKER_CONCURRENCY_RANGE.min)
  .max(WORKER_CONCURRENCY_RANGE.max)
  .nullable()

/** PATCH /api/workers/:workerId（自鯖Worker の所有者） */
export const updateWorkerRequestSchema = z
  .object({ name: trimmed(WORKER_NAME_LENGTH), concurrencyLimit: concurrencyLimitSchema })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." })

export type UpdateWorkerRequest = z.infer<typeof updateWorkerRequestSchema>

export const workerGuildScopeSchema = z.enum(["none", "server", "personal"])
export type WorkerGuildScope = z.infer<typeof workerGuildScopeSchema>

export interface WorkerGuildConnection {
  guildId: string
  guildName: string
  canManage: boolean
  scope: WorkerGuildScope
}

export const updateWorkerGuildsRequestSchema = z
  .object({
    connections: z
      .array(z.object({ guildId: snowflakeSchema, scope: z.enum(["server", "personal"]) }).strict())
      .max(500)
      .refine((list) => new Set(list.map((c) => c.guildId)).size === list.length, {
        message: "guildId must be unique.",
      }),
  })
  .strict()

export type UpdateWorkerGuildsRequest = z.infer<typeof updateWorkerGuildsRequestSchema>

/* ---------- Usage / Status ---------- */

export const usagePeriodSchema = z.enum(["today", "7d", "30d", "month"])
export type UsagePeriod = z.infer<typeof usagePeriodSchema>

export interface DailyUsage {
  date: string
  characters: number
  requests: number
}

export interface GuildUsage {
  guildId: string
  guildName: string
  characters: number
  requests: number
}

export interface UsageSummary {
  period: UsagePeriod
  characters: number
  requests: number
  officialWorkerCharacters: number
  privateWorkerCharacters: number
  daily: DailyUsage[]
  byGuild: GuildUsage[]
}

export type BotStatus = "online" | "degraded" | "offline"

export interface ServiceStatus {
  bot: BotStatus
  gatewayLatencyMs: number
  /** 運営者からのお知らせ（全ユーザーの画面に表示する） */
  announcement?: Announcement | null
  /** 全サーバーの読み上げを一時停止している（メンテナンス） */
  readingPaused?: boolean
}

export interface Announcement {
  message: string
  level: "info" | "warning"
}

/* ---------- 運営コンソール（/api/admin/*） ---------- */

/** カーソル方式のページング。nextCursor が null なら最後 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export const pageQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  cursor: z.uuid().optional(),
})

export interface AdminOverview {
  bot: { status: BotStatus; pingMs: number }
  workers: {
    official: { total: number; online: number }
    private: { total: number; online: number }
  }
  guilds: { installed: number; total: number }
  users: number
  usage: {
    today: { characters: number; requests: number; officialCharacters: number; privateCharacters: number }
    last7Days: { characters: number; requests: number; officialCharacters: number; privateCharacters: number }
  }
  recentAuditLogs: AuditLogEntry[]
}

/* 運営者の権限: owner は .env で指定し、Web からは変更できない */
export const operatorRoleSchema = z.enum(["admin", "editor", "viewer"])
export type OperatorRole = "owner" | z.infer<typeof operatorRoleSchema>

/** 利用停止の情報 */
export interface Suspension {
  at: string
  reason: string
  by: { id: string; name: string } | null
}

/** 利用停止・削除など、取り消せない操作・影響の大きい操作の理由 */
export const reasonRequestSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

export interface AdminGuild {
  id: string
  name: string
  suspended: boolean
  iconUrl?: string
  memberCount?: number
  botInstalled: boolean
  readingStatus: ReadingStatus
  messagesToday: number
  lastActiveAt?: string
  createdAt: string
}

export interface AdminGuildDetail extends AdminGuild {
  suspension: Suspension | null
  ownerId: string
  settings: Pick<GuildSettings, "readingMode" | "workerMode" | "fallbackToOfficial" | "maxCharacters" | "voice">
  /** 接続された自鯖Worker（サーバーで共有 / 自分専用） */
  workers: { id: string; name: string; status: WorkerStatus; scope: "server" | "personal"; ownerName?: string }[]
  sessions: GuildSession[]
  dictionaryEntries: number
  usage30Days: { characters: number; requests: number; daily: DailyUsage[] }
  auditLogs: AuditLogEntry[]
}

export interface AdminUser {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  privateWorkers: number
  hasVoice: boolean
  isOperator: boolean
  suspended: boolean
  createdAt: string
  updatedAt: string
}

export interface AuditLogEntry {
  id: string
  action: string
  actor: { id: string; name: string } | null
  guild: { id: string; name: string } | null
  targetType: string
  targetId: string | null
  metadata: unknown
  createdAt: string
}

export const auditLogQuerySchema = z.object({
  /** 操作の種類（前方一致。例: worker. / guild.settings） */
  action: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z_.]*$/)
    .optional(),
  guildId: snowflakeSchema.optional(),
  cursor: z.uuid().optional(),
})

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>

export interface AdminUserDetail extends AdminUser {
  operatorRole: OperatorRole | null
  suspension: Suspension | null
  voice: VoiceSettings | null
  workers: AdminWorker[]
  /** Web のログイン中のセッション数 */
  sessions: number
}

/** 運営コンソールの Worker（公式・自鯖） */
export interface AdminWorker extends Worker {
  /** false = メンテナンス中（振り分けに使わない・接続を受け付けない） */
  enabled: boolean
  owner: { id: string; name: string } | null
  /** 接続先のサーバー数（公式Worker は担当に指定したサーバー数） */
  connections: number
  /** 運営者が止めたエンジン */
  disabledEngines: string[]
  /** 公式Worker のみ: all = 全サーバー / selected = 指定したサーバーだけ */
  guildScope?: "all" | "selected"
}

export interface AdminWorkerConnection {
  guildId: string
  guildName: string
  scope: "server" | "personal"
}

export const adminWorkersQuerySchema = pageQuerySchema.extend({
  status: z.enum(["connected", "disconnected", "disabled"]).optional(),
})

export const updateAdminWorkerRequestSchema = z
  .object({
    name: trimmed(WORKER_NAME_LENGTH),
    enabled: z.boolean(),
    disabledEngines: z
      .array(engineIdSchema)
      .max(ENGINE_IDS.length)
      .refine((v) => new Set(v).size === v.length, { message: "disabledEngines must be unique." }),
    guildScope: z.enum(["all", "selected"]),
    concurrencyLimit: concurrencyLimitSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." })

export type UpdateAdminWorkerRequest = z.infer<typeof updateAdminWorkerRequestSchema>

/* ---------- サービス全体の設定 ---------- */

export const SYSTEM_LIMIT_RANGE = {
  maxWorkersPerUser: { min: 0, max: 1000 },
  dictionaryMaxEntries: { min: 0, max: 100_000 },
  maxCharactersLimit: MAX_CHARACTERS_RANGE,
} as const

export interface SystemSettingsView {
  limits: { maxWorkersPerUser: number; dictionaryMaxEntries: number; maxCharactersLimit: number }
  newGuildDefaults: { maxCharacters: number; voice: VoiceSettings }
  readingPaused: boolean
  announcement: Announcement | null
  updatedAt: string
}

const intIn = (range: { min: number; max: number }) => z.number().int().min(range.min).max(range.max)

export const updateSystemSettingsRequestSchema = z
  .object({
    limits: z
      .object({
        maxWorkersPerUser: intIn(SYSTEM_LIMIT_RANGE.maxWorkersPerUser),
        dictionaryMaxEntries: intIn(SYSTEM_LIMIT_RANGE.dictionaryMaxEntries),
        maxCharactersLimit: intIn(SYSTEM_LIMIT_RANGE.maxCharactersLimit),
      })
      .partial()
      .strict(),
    newGuildDefaults: z
      .object({ maxCharacters: intIn(MAX_CHARACTERS_RANGE), voice: voiceSettingsSchema })
      .partial()
      .strict(),
    readingPaused: z.boolean(),
    announcement: z
      .object({ message: z.string().trim().min(1).max(500), level: z.enum(["info", "warning"]) })
      .strict()
      .nullable(),
  })
  .partial()
  .strict()

export type UpdateSystemSettingsRequest = z.infer<typeof updateSystemSettingsRequestSchema>

/* ---------- 運営者の管理 ---------- */

export interface OperatorEntry {
  discordUserId: string
  role: OperatorRole
  /** env = .env で指定（Web から変更できない） */
  source: "env" | "web"
  user: { name: string; avatarUrl?: string } | null
  createdAt?: string
}

export const createOperatorRequestSchema = z
  .object({ discordUserId: snowflakeSchema, role: operatorRoleSchema })
  .strict()

export const updateOperatorRequestSchema = z.object({ role: operatorRoleSchema }).strict()

/** Bot への指示の結果 */
export interface BotCommandResult {
  ok: boolean
  message?: string
}
