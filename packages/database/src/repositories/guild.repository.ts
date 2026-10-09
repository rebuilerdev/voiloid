import type { DbClient } from "../client"

export interface DiscordGuildInfo {
  discordGuildId: string
  name: string
  icon: string | null
  ownerDiscordUserId: string
  memberCount?: number | null
}

export function guildRepository(db: DbClient) {
  return {
    /** Bot が参加している（参加した）サーバーを同期する */
    upsertInstalled(info: DiscordGuildInfo) {
      const data = {
        name: info.name,
        icon: info.icon,
        ownerDiscordUserId: info.ownerDiscordUserId,
        memberCount: info.memberCount ?? null,
        botInstalled: true,
      }
      return db.guild.upsert({
        where: { discordGuildId: info.discordGuildId },
        create: { discordGuildId: info.discordGuildId, ...data },
        update: data,
      })
    },

    /** Bot がサーバーから削除された。設定・辞書は再導入に備えて残す */
    async markUninstalled(discordGuildId: string): Promise<void> {
      await db.guild.updateMany({ where: { discordGuildId }, data: { botInstalled: false } })
    },

    /** 起動時の同期: 参加中のサーバー以外を未導入にする */
    async markUninstalledExcept(discordGuildIds: string[]): Promise<number> {
      const result = await db.guild.updateMany({
        where: { botInstalled: true, discordGuildId: { notIn: discordGuildIds } },
        data: { botInstalled: false },
      })
      return result.count
    },

    findByDiscordId(discordGuildId: string) {
      return db.guild.findUnique({ where: { discordGuildId } })
    },

    /** 利用停止（理由は必須）。null で再開 */
    setSuspension(guildId: string, suspension: { reason: string; byUserId: string } | null) {
      return db.guild.update({
        where: { id: guildId },
        data: suspension
          ? { suspendedAt: new Date(), suspendedReason: suspension.reason, suspendedByUserId: suspension.byUserId }
          : { suspendedAt: null, suspendedReason: null, suspendedByUserId: null },
      })
    },

    findManyByDiscordIds(discordGuildIds: string[]) {
      return db.guild.findMany({ where: { discordGuildId: { in: discordGuildIds } } })
    },
  }
}

export type GuildRepository = ReturnType<typeof guildRepository>
