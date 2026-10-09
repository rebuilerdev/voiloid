import type { VoiceSettings } from "@/types/voice"

export type ReadingStatus = "active" | "idle" | "disabled"

/** 仕様書 §59 + 一覧表示用の項目 */
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
  /** active = VC 接続中 / idle = 有効だが未接続 / disabled = 無効 */
  readingStatus?: ReadingStatus
  /** 現在の読み上げ音声の話者名 */
  voiceName?: string
  lastActiveAt?: string
  /** サブボットの参加状況（サブボットがある場合のみ） */
  subBots?: { present: number; total: number }
}

/** 読み上げ Bot（メイン・サブボット）と、サーバーへの参加状況 */
export interface GuildBot {
  /** Discord のユーザー ID */
  id: string
  name: string
  avatarUrl?: string
  /** main = コマンドを受け付ける Bot / sub = 同じサーバーの別の VC で読み上げる Bot */
  role: "main" | "sub"
  present: boolean
  inviteUrl: string
}

export interface GuildSession {
  textChannelName: string
  voiceChannelName: string
  connected: boolean
}

/** GET /api/guilds/:guildId */
export interface GuildDetail extends Guild {
  session?: GuildSession
  currentWorkerName?: string
  messagesReadToday: number
  /**
   * サーバーで使えるエンジン（Worker 設定のモードに従う公式Worker + サーバーに共有された自鯖Worker）。
   * 仕様書 §63 に無い項目（Backend と要合意）
   */
  availableEngines: string[]
  /** メイン → サブボットの順 */
  bots: GuildBot[]
}

export interface GuildChannel {
  id: string
  name: string
  type: "text" | "voice"
}

export type LongMessageBehavior = "truncate" | "skip"

/**
 * command = `/join` を実行したテキストチャンネルを、実行者のいる VC で読み上げる（既定）
 * fixed = 設定したテキストチャンネル・VC で読み上げる
 */
export type ReadingMode = "command" | "fixed"

export type WorkerMode = "auto" | "official" | "private_preferred" | "specific"

/** 仕様書 §61 + Guild 固有の音声設定 */
export interface GuildSettings {
  /** 既定は command。仕様書 §61 に無い項目（Backend と要合意） */
  readingMode: ReadingMode
  /** readingMode = fixed のときのみ使用 */
  textChannelId?: string
  voiceChannelId?: string
  /** readingMode = fixed のときのみ使用 */
  autoJoin: boolean
  readUrls: boolean
  maxCharacters: number
  longMessageBehavior: LongMessageBehavior
  workerMode: WorkerMode
  workerId?: string
  fallbackToOfficial: boolean
  /** サーバーのデフォルト音声。マイボイス未設定・使えないメンバーに使う */
  voice: VoiceSettings
  /** このサーバーで使わないエンジン（声の選択肢・読み上げから外す）。デフォルト音声のエンジンは含められない */
  disabledEngines: string[]
}

export const MAX_CHARACTERS_RANGE = { min: 1, max: 1000 } as const

/**
 * サーバーごとの Bot プロフィール（Discord: Modify Current Member）。
 * 仕様書 §63 に無い API（Backend と要合意）
 */
export interface GuildBotProfile {
  /** null = Bot の既定の名前 */
  nickname: string | null
  /** null = Bot の既定のアバター */
  avatarUrl: string | null
  defaultName: string
  defaultAvatarUrl?: string
}

export interface UpdateGuildBotProfileRequest {
  nickname?: string | null
  /** 画像の data URL。null で既定に戻す。省略時は変更しない */
  avatar?: string | null
}

export const BOT_NICKNAME_LENGTH = { min: 1, max: 32 } as const

export const BOT_AVATAR = {
  maxBytes: 4 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/gif", "image/webp"],
} as const
