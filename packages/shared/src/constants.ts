/**
 * 入力制約。Web GUI・Control API・Bot で同じ値を使う。
 */

export const VOICE_PARAM_RANGE = {
  speed: { min: 0.5, max: 2, step: 0.05, default: 1 },
  pitch: { min: -0.15, max: 0.15, step: 0.01, default: 0 },
  intonation: { min: 0, max: 2, step: 0.05, default: 1 },
} as const

export const MAX_CHARACTERS_RANGE = { min: 1, max: 1000 } as const

export const AUTO_LEAVE_DELAY_RANGE = { min: 0, max: 600 } as const

export const DICTIONARY_LENGTH = {
  word: { min: 1, max: 128 },
  reading: { min: 1, max: 256 },
} as const

/** 1 サーバーあたりの辞書登録数の上限 */
export const DICTIONARY_MAX_ENTRIES = 1000

export const WORKER_NAME_LENGTH = { min: 1, max: 64 } as const

/** Worker の同時処理の数（Worker の MAX_CONCURRENCY・Web で設定する上限） */
export const WORKER_CONCURRENCY_RANGE = { min: 1, max: 64 } as const

export const BOT_NICKNAME_LENGTH = { min: 1, max: 32 } as const

export const BOT_AVATAR = {
  maxBytes: 4 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/gif", "image/webp"],
} as const

export const VOICE_PREVIEW_TEXT_LENGTH = { min: 1, max: 200 } as const

/** サーバーのデフォルト音声の既定値（DB の既定値と同じ: VOICEVOX ずんだもん ノーマル） */
export const DEFAULT_GUILD_VOICE = {
  engine: "VOICEVOX",
  speakerId: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
  styleId: "3",
  speed: 1,
  pitch: 0,
  intonation: 1,
} as const

/** Bot の招待に必要な権限（Discord の権限ビット。いずれも 32 ビットに収まる） */
export const BOT_INVITE_PERMISSIONS = {
  /** 接続・発言・ニックネームの変更（サーバーごとの Bot 名） */
  main: (1 << 20) | (1 << 21) | (1 << 26),
  /** チャンネルを見る・接続・発言（サブボットは VC で音声を流すだけ） */
  sub: (1 << 10) | (1 << 20) | (1 << 21),
} as const

/** Bot の招待 URL。サブボットはコマンドを登録しない（applications.commands を付けない） */
export function botInviteUrl(clientId: string, role: "main" | "sub", guildId?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: role === "main" ? "bot applications.commands" : "bot",
    permissions: String(BOT_INVITE_PERMISSIONS[role]),
  })
  if (guildId) {
    params.set("guild_id", guildId)
    params.set("disable_guild_select", "true")
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}
