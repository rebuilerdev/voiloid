/** 仕様書 §57 */
export type WorkerStatus = "online" | "busy" | "offline" | "error"

export type WorkerType = "official" | "private"

export interface WorkerEngine {
  engine: string
  status: "healthy" | "unhealthy"
  version?: string
}

/** 仕様書 §58 + 詳細表示用の項目 */
export interface Worker {
  id: string
  name: string
  type: WorkerType
  status: WorkerStatus
  engines: WorkerEngine[]
  runningJobs: number
  maxConcurrency: number
  latency?: number
  lastSeenAt?: string
  queue?: number
  createdAt?: string
}

/**
 * none = 接続しない
 * server = サーバーで共有（全員の読み上げに使う。管理権限が必要）
 * personal = 自分専用（自分のメッセージの読み上げにだけ使う）
 */
export type WorkerGuildScope = "none" | "server" | "personal"

/** GET /api/workers/:id/guilds（仕様書 §63 の allowed を scope に拡張） */
export interface WorkerGuildConnection {
  guildId: string
  guildName: string
  canManage: boolean
  scope: WorkerGuildScope
}

export interface UpdateWorkerGuildsRequest {
  /** scope = none のサーバーは含めなくてよい */
  connections: { guildId: string; scope: Exclude<WorkerGuildScope, "none"> }[]
}

export interface CreateWorkerRequest {
  name: string
  engines: string[]
}

export interface CreateWorkerResponse {
  worker: Worker
  /** 一度だけ返される接続トークン */
  token: string
}

export const WORKER_NAME_LENGTH = { min: 1, max: 64 } as const

/** Worker 登録時に選択できる Engine（仕様書 §41） */
export const SELECTABLE_ENGINES = ["VOICEVOX", "AivisSpeech", "COEIROINK"] as const
