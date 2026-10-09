import type { CurrentUser, MemberGuild, UpdateMeRequest } from "@/types/user"
import { apiRequest } from "@/services/http"

export function getMe() {
  return apiRequest<CurrentUser>("GET", "/api/me")
}

/** NOTE: 仕様書 §63 に未記載（マイボイスの保存用）。バックエンドと要合意 */
export function updateMe(input: UpdateMeRequest) {
  return apiRequest<CurrentUser>("PATCH", "/api/me", input)
}

/** NOTE: 仕様書 §63 に未記載。参加しているサーバーと、自分のメッセージで使えるエンジン */
export function listMyGuilds() {
  return apiRequest<MemberGuild[]>("GET", "/api/me/guilds")
}
