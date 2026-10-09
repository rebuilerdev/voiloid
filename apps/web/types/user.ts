import type { OperatorRole } from "@/types/admin"
import type { VoiceSettings } from "@/types/voice"

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  /**
   * マイボイス: 自分のメッセージを読み上げる声（全サーバー共通）。
   * null = 各サーバーのデフォルト音声を使う。
   * 使えないエンジンのサーバーでは、そのサーバーのデフォルト音声になる。
   */
  voice: VoiceSettings | null
  /** サービスの運営者（運営コンソールを使える） */
  isOperator: boolean
  /** 運営者の権限（運営者でなければ null） */
  operatorRole: OperatorRole | null
}

export interface UpdateMeRequest {
  voice: VoiceSettings | null
}

/** GET /api/me/guilds（仕様書 §63 に無い API）: 自分が参加している Bot 導入済みのサーバー */
export interface MemberGuild {
  id: string
  name: string
  iconUrl?: string
  /** Owner / Administrator / Manage Guild のいずれか */
  canManage: boolean
  /** 自分のメッセージで使えるエンジン（サーバーで使えるエンジン + 自分専用で接続した Worker） */
  availableEngines: string[]
}
