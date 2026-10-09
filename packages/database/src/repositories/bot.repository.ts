import type { DbClient } from "../client"
import type { BotRole } from "../generated/prisma/client"

export interface BotInfo {
  discordUserId: string
  role: BotRole
  position: number
  name: string
  avatar: string | null
}

/** 読み上げ Bot（メイン・サブボット）と、各 Bot が参加しているサーバー */
export function botRepository(db: DbClient) {
  return {
    /** 起動時: 今の設定の Bot を登録・更新し、それ以外（外されたサブボット）を無効にする */
    async syncBots(bots: BotInfo[]): Promise<void> {
      for (const { discordUserId, ...data } of bots) {
        await db.bot.upsert({
          where: { discordUserId },
          create: { discordUserId, ...data, active: true },
          update: { ...data, active: true },
        })
      }
      await db.bot.updateMany({
        where: { active: true, discordUserId: { notIn: bots.map((b) => b.discordUserId) } },
        data: { active: false },
      })
    },

    /** 有効な Bot（メイン → サブボットの順） */
    listActive() {
      return db.bot.findMany({ where: { active: true }, orderBy: [{ role: "asc" }, { position: "asc" }] })
    },

    /** 起動時: Bot が参加しているサーバーを置き換える */
    async replaceMemberships(botUserId: string, discordGuildIds: string[]): Promise<void> {
      await db.guildBotMembership.deleteMany({ where: { botUserId, discordGuildId: { notIn: discordGuildIds } } })
      await db.guildBotMembership.createMany({
        data: discordGuildIds.map((discordGuildId) => ({ botUserId, discordGuildId })),
        skipDuplicates: true,
      })
    },

    async addMembership(botUserId: string, discordGuildId: string): Promise<void> {
      await db.guildBotMembership.createMany({ data: [{ botUserId, discordGuildId }], skipDuplicates: true })
    },

    async removeMembership(botUserId: string, discordGuildId: string): Promise<void> {
      await db.guildBotMembership.deleteMany({ where: { botUserId, discordGuildId } })
    },

    /** サーバーごとの、参加している有効な Bot の ID */
    async membersByGuild(discordGuildIds: string[]): Promise<Map<string, Set<string>>> {
      const rows = await db.guildBotMembership.findMany({
        where: { discordGuildId: { in: discordGuildIds }, bot: { active: true } },
        select: { botUserId: true, discordGuildId: true },
      })
      const result = new Map<string, Set<string>>()
      for (const row of rows) {
        const members = result.get(row.discordGuildId) ?? new Set<string>()
        members.add(row.botUserId)
        result.set(row.discordGuildId, members)
      }
      return result
    },
  }
}

export type BotRepository = ReturnType<typeof botRepository>
