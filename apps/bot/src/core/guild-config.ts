/**
 * サーバーごとの読み上げ設定と辞書（Bot 内でキャッシュし、設定変更の通知で破棄する）。
 */
import { longMessageFromDb, ReadUrlsMode, readingModeFromDb, type Repositories } from "@voiloid/database"
import { compileDictionary, type Dictionary } from "@voiloid/shared"
import type { LongMessageBehavior, ReadingMode } from "@voiloid/shared/contracts"

export interface GuildConfig {
  guildId: string
  /** 運営者による利用停止中（読み上げない） */
  suspended: boolean
  readingMode: ReadingMode
  textChannelId: string | null
  voiceChannelId: string | null
  autoJoin: boolean
  readUrls: boolean
  maxCharacters: number
  longMessageBehavior: LongMessageBehavior
  autoLeaveDelaySeconds: number
  dictionary: Dictionary
}

const TTL_MS = 60_000

export function createGuildConfigStore(repos: Repositories, now: () => number = Date.now) {
  const cache = new Map<string, { value: Promise<GuildConfig | null>; expiresAt: number }>()

  async function load(discordGuildId: string): Promise<GuildConfig | null> {
    const guild = await repos.guilds.findByDiscordId(discordGuildId)
    if (!guild) return null
    const [settings, rules] = await Promise.all([
      repos.guildSettings.getOrCreate(guild.id),
      repos.dictionary.listRules(guild.id),
    ])
    return {
      guildId: guild.id,
      suspended: guild.suspendedAt !== null,
      readingMode: readingModeFromDb[settings.readingMode],
      textChannelId: settings.defaultTextChannelId,
      voiceChannelId: settings.defaultVoiceChannelId,
      autoJoin: settings.autoJoin,
      readUrls: settings.readUrlsMode === ReadUrlsMode.READ,
      maxCharacters: settings.maxCharacters,
      longMessageBehavior: longMessageFromDb[settings.longMessageBehavior],
      autoLeaveDelaySeconds: settings.autoLeaveDelaySeconds,
      dictionary: compileDictionary(rules),
    }
  }

  return {
    get(discordGuildId: string): Promise<GuildConfig | null> {
      const entry = cache.get(discordGuildId)
      if (entry && entry.expiresAt > now()) return entry.value
      const value = load(discordGuildId)
      cache.set(discordGuildId, { value, expiresAt: now() + TTL_MS })
      value.catch(() => cache.delete(discordGuildId))
      return value
    },
    invalidate(discordGuildId: string) {
      cache.delete(discordGuildId)
    },
  }
}

export type GuildConfigStore = ReturnType<typeof createGuildConfigStore>
