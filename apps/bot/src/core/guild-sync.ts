/**
 * Bot が参加しているサーバーを DB に同期する（Web GUI の「Bot 導入済み」の判定に使う）。
 */
import type { DiscordGuildInfo, Repositories } from "@voiloid/database"
import type { Logger } from "pino"

export function createGuildSync(repos: Repositories, logger: Logger) {
  return {
    /** 起動時: 参加中のサーバーをすべて更新し、退出済みのサーバーを未導入にする */
    async syncAll(guilds: DiscordGuildInfo[]): Promise<void> {
      for (const guild of guilds) await repos.guilds.upsertInstalled(guild)
      const removed = await repos.guilds.markUninstalledExcept(guilds.map((g) => g.discordGuildId))
      logger.info({ guilds: guilds.length, removed }, "synchronized guilds")
    },

    async joined(guild: DiscordGuildInfo): Promise<void> {
      const record = await repos.guilds.upsertInstalled(guild)
      await repos.guildSettings.getOrCreate(record.id)
      logger.info({ guild: guild.discordGuildId }, "joined a guild")
    },

    async updated(guild: DiscordGuildInfo): Promise<void> {
      await repos.guilds.upsertInstalled(guild)
    },

    async left(discordGuildId: string): Promise<void> {
      await repos.guilds.markUninstalled(discordGuildId)
      logger.info({ guild: discordGuildId }, "left a guild")
    },
  }
}
