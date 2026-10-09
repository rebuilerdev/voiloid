/**
 * 環境依存の設定はここからのみ参照する（コンポーネントに URL を書かない）。
 */

/** 本番 API のベース URL。未設定時は同一オリジン（/api/...） */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""

/** Backend 未完成時のモック利用。明示的に "false" を指定した場合のみ無効 */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false"

/** Worker が接続する制御サーバー（セットアップ手順に表示） */
export const WORKER_CONTROL_SERVER =
  process.env.NEXT_PUBLIC_WORKER_CONTROL_SERVER ?? "wss://api.example.com/worker"

export const WORKER_IMAGE = process.env.NEXT_PUBLIC_WORKER_IMAGE ?? "service/worker:latest"

/** Bot 招待 URL 用の Discord Application ID（公開情報） */
export const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "000000000000000000"

export const SESSION_COOKIE = "voiloid_session"
export const LOCALE_COOKIE = "NEXT_LOCALE"

/** Worker 状態の自動更新間隔（仕様書 §80: 5〜10 秒） */
export const WORKER_POLL_INTERVAL_MS = 7000

export function botInviteUrl(guildId?: string) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    scope: "bot applications.commands",
    // CONNECT | SPEAK | CHANGE_NICKNAME（サーバーごとの Bot 名の変更に必要）
    permissions: String((1 << 20) | (1 << 21) | (1 << 26)),
  })
  if (guildId) {
    params.set("guild_id", guildId)
    params.set("disable_guild_select", "true")
  }
  return `https://discord.com/oauth2/authorize?${params}`
}
