import type { DbClient } from "../client"

export interface BotProfileUpdate {
  nickname?: string | null
  avatarObjectKey?: string | null
  discordAvatarHash?: string | null
  updatedByUserId: string
}

export function botProfileRepository(db: DbClient) {
  return {
    findByGuildId(guildId: string) {
      return db.guildBotProfile.findUnique({ where: { guildId } })
    },

    /** Discord への反映が成功した後にだけ呼ぶ（DB だけ先に新しいプロフィールにしない） */
    upsert(guildId: string, update: BotProfileUpdate) {
      return db.guildBotProfile.upsert({
        where: { guildId },
        create: { guildId, ...update },
        update,
      })
    },
  }
}

export type BotProfileRepository = ReturnType<typeof botProfileRepository>
