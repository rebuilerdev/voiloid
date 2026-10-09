/**
 * スラッシュコマンドの登録。DEV_GUILD_ID を指定するとそのサーバーにだけ即時反映（未指定ならグローバル登録。反映に最大 1 時間）。
 */
import { Routes, type REST } from "discord.js"

import { commandDefinitions } from "./definitions"

export async function registerCommands(rest: REST, clientId: string, devGuildId?: string): Promise<number> {
  const route = devGuildId
    ? Routes.applicationGuildCommands(clientId, devGuildId)
    : Routes.applicationCommands(clientId)
  await rest.put(route, { body: commandDefinitions })
  return commandDefinitions.length
}

/** すべての Bot をサーバーから退出させる */
export async function leaveGuild(
  clients: { guilds: { cache: Map<string, { leave(): Promise<unknown> }> } }[],
  guildId: string,
) {
  let left = 0
  for (const client of clients) {
    const guild = client.guilds.cache.get(guildId)
    if (!guild) continue
    await guild.leave()
    left++
  }
  return left
}
