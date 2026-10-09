import type { DbClient } from "../client"
import type { GuildSettings } from "../generated/prisma/client"

/** 更新できる項目。undefined の項目は変更しない。null は値を消す */
export type GuildSettingsPatch = Partial<Omit<GuildSettings, "guildId" | "createdAt" | "updatedAt">>

export function guildSettingsRepository(db: DbClient) {
  return {
    /** 設定が無ければ、サービス全体の設定にある「新しいサーバーの初期値」で作成して返す */
    async getOrCreate(guildId: string) {
      const existing = await db.guildSettings.findUnique({ where: { guildId } })
      if (existing) return existing
      const system = await db.systemSettings.findUnique({ where: { id: 1 } })
      const defaults = system
        ? {
            maxCharacters: system.newGuildMaxCharacters,
            voiceEngineId: system.newGuildVoiceEngineId,
            voiceSpeakerId: system.newGuildVoiceSpeakerId,
            voiceStyleId: system.newGuildVoiceStyleId,
            voiceSpeed: system.newGuildVoiceSpeed,
            voicePitch: system.newGuildVoicePitch,
            voiceIntonation: system.newGuildVoiceIntonation,
          }
        : {}
      return db.guildSettings.upsert({ where: { guildId }, create: { guildId, ...defaults }, update: {} })
    },

    findManyByGuildIds(guildIds: string[]) {
      return db.guildSettings.findMany({ where: { guildId: { in: guildIds } } })
    },

    update(guildId: string, patch: GuildSettingsPatch) {
      return db.guildSettings.upsert({ where: { guildId }, create: { guildId, ...patch }, update: patch })
    },
  }
}

export type GuildSettingsRepository = ReturnType<typeof guildSettingsRepository>
