import type { DbClient } from "../client"
import { adminRepository } from "./admin.repository"
import { auditRepository } from "./audit.repository"
import { operatorRepository } from "./operator.repository"
import { systemSettingsRepository } from "./system-settings.repository"
import { botProfileRepository } from "./bot-profile.repository"
import { dictionaryRepository } from "./dictionary.repository"
import { guildSettingsRepository } from "./guild-settings.repository"
import { guildRepository } from "./guild.repository"
import { usageRepository } from "./usage.repository"
import { userRepository } from "./user.repository"
import { voiceSessionRepository } from "./voice-session.repository"
import { workerRepository } from "./worker.repository"

/** Repository 一式。Transaction 内では tx を渡して同じ Repository を使う */
export function createRepositories(db: DbClient) {
  return {
    admin: adminRepository(db),
    audit: auditRepository(db),
    botProfiles: botProfileRepository(db),
    dictionary: dictionaryRepository(db),
    guildSettings: guildSettingsRepository(db),
    guilds: guildRepository(db),
    operators: operatorRepository(db),
    system: systemSettingsRepository(db),
    usage: usageRepository(db),
    users: userRepository(db),
    voiceSessions: voiceSessionRepository(db),
    workers: workerRepository(db),
  }
}

export type Repositories = ReturnType<typeof createRepositories>

export { dictionaryWordKey, type DictionaryInput } from "./dictionary.repository"
export type { PageInput, PageResult } from "./admin.repository"
export type { AuditEntry } from "./audit.repository"
export type { BotProfileUpdate } from "./bot-profile.repository"
export type { DiscordGuildInfo } from "./guild.repository"
export type { GuildSettingsPatch } from "./guild-settings.repository"
export type { SystemSettingsPatch } from "./system-settings.repository"
export type { UsageEventInput, UsageRange } from "./usage.repository"
export type { DiscordUserProfile } from "./user.repository"
export type { VoiceSessionStart } from "./voice-session.repository"
export { workerSelect, type EngineSync, type WorkerRecord } from "./worker.repository"
