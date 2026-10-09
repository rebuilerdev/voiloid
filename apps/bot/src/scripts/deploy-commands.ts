/**
 * スラッシュコマンドを Discord に登録する（運営コンソールの「コマンドを再登録」と同じ処理）。
 */
import { REST } from "discord.js"

import { loadConfig } from "../config"
import { registerCommands } from "../discord/register"

const config = loadConfig()
const count = await registerCommands(
  new REST().setToken(config.DISCORD_TOKEN),
  config.DISCORD_CLIENT_ID,
  config.DEV_GUILD_ID,
)
console.log(`Registered ${count} commands ${config.DEV_GUILD_ID ? `to guild ${config.DEV_GUILD_ID}` : "globally"}.`)
