import type { Database, Repositories } from "@voiloid/database"
import type { Redis } from "ioredis"

import type { Config } from "./config"
import type { BotCommander } from "./lib/bot-commands"
import type { DiscordApi } from "./lib/discord"
import type { GatewayClient } from "./lib/gateway"
import type { SessionStore } from "./lib/session"
import type { ObjectStorage } from "./lib/storage"

/** アプリケーションの依存。テストでは外部サービス（Discord / Gateway / Storage）を差し替える */
export interface AppDeps {
  config: Config
  db: Database
  repos: Repositories
  redis: Redis
  discord: DiscordApi
  gateway: GatewayClient
  storage: ObjectStorage
  sessions: SessionStore
  /** Bot への指示（読み上げの終了・サーバーからの退出・コマンドの登録） */
  bot: BotCommander
  now: () => Date
}
