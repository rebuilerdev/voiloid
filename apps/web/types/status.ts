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
