import type {
  Guild,
  GuildBotProfile,
  GuildChannel,
  GuildDetail,
  GuildSettings,
  UpdateGuildBotProfileRequest,
} from "@/types/guild"
import type { Worker } from "@/types/worker"
import { apiRequest } from "@/services/http"

const base = (guildId: string) => `/api/guilds/${encodeURIComponent(guildId)}`

export function listGuilds() {
  return apiRequest<Guild[]>("GET", "/api/guilds")
}

export function getGuild(guildId: string) {
  return apiRequest<GuildDetail>("GET", base(guildId))
}

export function getGuildChannels(guildId: string) {
  return apiRequest<GuildChannel[]>("GET", `${base(guildId)}/channels`)
}

export function getGuildSettings(guildId: string) {
  return apiRequest<GuildSettings>("GET", `${base(guildId)}/settings`)
}

export function updateGuildSettings(guildId: string, patch: Partial<GuildSettings>) {
  return apiRequest<GuildSettings>("PATCH", `${base(guildId)}/settings`, patch)
}

/** サーバーに「サーバーで共有」された自鯖Worker（仕様書 §63 に無い API。Worker ごとの取得による N+1 を避ける） */
export function listGuildSharedWorkers(guildId: string) {
  return apiRequest<Worker[]>("GET", `${base(guildId)}/workers`)
}

/** 仕様書 §63 に無い API（Backend と要合意） */
export function getGuildBotProfile(guildId: string) {
  return apiRequest<GuildBotProfile>("GET", `${base(guildId)}/bot-profile`)
}

/** 仕様書 §63 に無い API（Backend と要合意） */
export function updateGuildBotProfile(guildId: string, patch: UpdateGuildBotProfileRequest) {
  return apiRequest<GuildBotProfile>("PATCH", `${base(guildId)}/bot-profile`, patch)
}
