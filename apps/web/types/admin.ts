/**
 * 運営コンソール（/api/admin/*）の型。Control API の契約（@voiloid/shared/contracts）と同じ形
 * （types/contract-check.ts でコンパイル時に確認する）。
 */
import type { DailyUsage } from "@/types/usage"
import type { GuildSession, GuildSettings, ReadingStatus } from "@/types/guild"
import type { Announcement, BotStatus } from "@/types/status"
import type { VoiceSettings } from "@/types/voice"
import type { Worker, WorkerStatus } from "@/types/worker"

/**
 * 運営者の権限（上位は下位の操作をすべてできる）
 * - viewer: 閲覧のみ
 * - editor: サーバー・ユーザー・Worker の操作
 * - admin: Bot の退出・ユーザーデータの削除・サービス全体の設定・運営者の管理
 * - owner: .env で指定（Web からは変更できない）
 */
export type OperatorRole = "owner" | "admin" | "editor" | "viewer"
export type OperatorLevel = Exclude<OperatorRole, "owner">

const RANK: Record<OperatorRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 }

/** その権限で操作できるか（画面の出し分け用。最終的な判定は Control API が行う） */
export function canOperate(role: OperatorRole | null | undefined, minimum: OperatorLevel): boolean {
  return role != null && RANK[role] >= RANK[minimum]
}

/** 利用停止の情報 */
export interface Suspension {
  at: string
  reason: string
  by: { id: string; name: string } | null
}

/** 利用停止・削除などの理由 */
export const REASON_LENGTH = { min: 1, max: 500 } as const

/** カーソル方式のページング。nextCursor が null なら最後 */
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface UsageTotals {
  characters: number
  requests: number
  officialCharacters: number
  privateCharacters: number
}

export interface AdminOverview {
  bot: { status: BotStatus; pingMs: number }
  workers: {
    official: { total: number; online: number }
    private: { total: number; online: number }
  }
  guilds: { installed: number; total: number }
  users: number
  usage: { today: UsageTotals; last7Days: UsageTotals }
  recentAuditLogs: AuditLogEntry[]
}

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

export interface AdminGuildWorker {
  id: string
  name: string
  status: WorkerStatus
  scope: "server" | "personal"
  ownerName?: string
}

export interface AdminGuildDetail extends AdminGuild {
  suspension: Suspension | null
  ownerId: string
  settings: Pick<GuildSettings, "readingMode" | "workerMode" | "fallbackToOfficial" | "maxCharacters" | "voice">
  workers: AdminGuildWorker[]
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
  /** 運営者が止めたエンジン（振り分け・声の一覧に使わない） */
  disabledEngines: string[]
  /** 公式Worker のみ: all = 全サーバー / selected = 指定したサーバーだけ */
  guildScope?: "all" | "selected"
}

export interface AdminWorkerConnection {
  guildId: string
  guildName: string
  scope: "server" | "personal"
}

/** 自鯖Worker 一覧の絞り込み */
export type AdminWorkerFilter = "connected" | "disconnected" | "disabled"

export interface UpdateAdminWorkerRequest {
  name?: string
  enabled?: boolean
  disabledEngines?: string[]
  guildScope?: "all" | "selected"
}

/* ---------- サービス全体の設定 ---------- */

export const SYSTEM_LIMIT_RANGE = {
  maxWorkersPerUser: { min: 0, max: 1000 },
  dictionaryMaxEntries: { min: 0, max: 100_000 },
  maxCharactersLimit: { min: 1, max: 1000 },
} as const

export interface SystemSettingsView {
  limits: { maxWorkersPerUser: number; dictionaryMaxEntries: number; maxCharactersLimit: number }
  newGuildDefaults: { maxCharacters: number; voice: VoiceSettings }
  readingPaused: boolean
  announcement: Announcement | null
  updatedAt: string
}

export interface UpdateSystemSettingsRequest {
  limits?: Partial<SystemSettingsView["limits"]>
  newGuildDefaults?: Partial<SystemSettingsView["newGuildDefaults"]>
  readingPaused?: boolean
  announcement?: Announcement | null
}

/* ---------- 運営者の管理 ---------- */

export interface OperatorEntry {
  discordUserId: string
  role: OperatorRole
  /** env = .env で指定（Web から変更できない） */
  source: "env" | "web"
  user: { name: string; avatarUrl?: string } | null
  createdAt?: string
}

/** Bot への指示の結果 */
export interface BotCommandResult {
  ok: boolean
  message?: string
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

export type AuditLogFilter = {
  /** 操作の種類（前方一致） */
  action?: string
  guildId?: string
}
