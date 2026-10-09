/**
 * 読み上げ Bot（メイン・サブボット）と、各 Bot が参加しているサーバーを DB に同期する。
 * Web GUI で、サブボットがサーバーにいるかの表示と個別の招待に使う。
 */
import type { Repositories } from "@voiloid/database"
import type { Logger } from "pino"

export interface BotIdentity {
  id: string
  name: string
  avatar: string | null
  /** 参加しているサーバーの ID */
  guildIds: string[]
}

export function createBotSync(repos: Repositories, logger: Logger) {
  return {
    /** 起動時: Bot の一覧（外したサブボットは無効にする）と、各 Bot の参加中のサーバーを同期する */
    async syncAll(main: BotIdentity, subs: BotIdentity[]): Promise<void> {
      const bots = [main, ...subs]
      await repos.bots.syncBots(
        bots.map((bot, position) => ({
          discordUserId: bot.id,
          role: position === 0 ? "MAIN" : "SUB",
          position,
          name: bot.name,
          avatar: bot.avatar,
        })),
      )
      for (const bot of bots) await repos.bots.replaceMemberships(bot.id, bot.guildIds)
      logger.info({ bots: bots.length }, "synchronized bots")
    },

    async joined(botUserId: string, guildId: string): Promise<void> {
      await repos.bots.addMembership(botUserId, guildId)
    },

    async left(botUserId: string, guildId: string): Promise<void> {
      await repos.bots.removeMembership(botUserId, guildId)
    },
  }
}
