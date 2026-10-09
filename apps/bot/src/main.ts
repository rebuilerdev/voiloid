import { once } from "node:events"

import { createDatabase, createRepositories } from "@voiloid/database"
import { invalidationSchema, redisKeys } from "@voiloid/shared/protocol"
import { Events, type Client } from "discord.js"
import { Redis } from "ioredis"
import { pino } from "pino"

import { loadConfig } from "./config"
import { createBotSync } from "./core/bot-sync"
import { createCommands } from "./core/commands"
import { createControlHandler } from "./core/control"
import { createGuildConfigStore } from "./core/guild-config"
import { createGuildSync } from "./core/guild-sync"
import { createReader } from "./core/reader"
import { cleanupStaleSessions, createSessionRecorder } from "./core/recorder"
import { createServiceState } from "./core/service-state"
import { SessionManager } from "./core/sessions"
import { createSynthesizer } from "./core/synthesizer"
import { botIdentity, channelName, createBotPool, createClients, guildInfo, registerEvents } from "./discord/bot"
import { leaveGuild, registerCommands } from "./discord/register"
import { createVoiceConnector } from "./discord/voice"

const HEARTBEAT_INTERVAL_MS = 20_000
/** 通知を取りこぼした場合に備えて、サービス全体の状態を定期的に読み直す */
const STATE_REFRESH_INTERVAL_MS = 60_000

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL, redact: ["*.token", "*.authorization"] })

const db = createDatabase({ url: config.DATABASE_URL, maxConnections: config.DATABASE_POOL_SIZE })
const repos = createRepositories(db)
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 })
const subscriber = new Redis(config.REDIS_URL)

// 1. すべての Bot をログインさせ、準備完了を待つ
const clients = createClients(config.DISCORD_TOKEN, config.SUB_BOT_TOKENS)
const all: Client[] = [clients.main, ...clients.subs]
const ready = all.map((client) => once(client, Events.ClientReady))
await clients.login()
await Promise.all(ready)
const readyClients = new Map(
  all.map((c) => {
    if (!c.isReady()) throw new Error("a bot failed to become ready")
    return [c.user.id, c] as const
  }),
)
logger.info({ bots: [...readyClients.keys()] }, "bots ready")

// 2. 前回のプロセスのセッションを片付け、参加中のサーバーを同期する
await cleanupStaleSessions(redis, repos, [...readyClients.keys()])
const guildSync = createGuildSync(repos, logger)
await guildSync.syncAll(clients.main.guilds.cache.map(guildInfo))
const botSync = createBotSync(repos, logger)
const [mainReady, ...subsReady] = [...readyClients.values()]
if (!mainReady) throw new Error("the main bot is not ready")
await botSync.syncAll(botIdentity(mainReady), subsReady.map(botIdentity))

// 3. 読み上げを始める
const configs = createGuildConfigStore(repos)
const state = createServiceState(repos)
await state.refresh()
const sessions = new SessionManager({
  connector: createVoiceConnector(readyClients, logger),
  synthesize: createSynthesizer({ baseUrl: config.GATEWAY_INTERNAL_URL, token: config.INTERNAL_API_TOKEN }),
  recorder: createSessionRecorder(redis, repos),
  logger,
  maxQueue: config.MAX_QUEUE,
})
const pool = createBotPool(all)
const pickBot = (guildId: string, voiceChannelId: string) => pool.pick(guildId, voiceChannelId, sessions)
const nameOf = (guildId: string, channelId: string) => channelName(clients.main, guildId, channelId)

registerEvents({
  main: clients.main,
  allClients: all,
  commands: createCommands({
    sessions,
    configs,
    state,
    repos,
    logger,
    appOrigin: config.APP_ORIGIN,
    pickBot,
    channelName: nameOf,
  }),
  reader: createReader({ sessions, configs, state, logger, pickBot, channelName: (g, c) => nameOf(g, c) ?? "" }),
  sessions,
  guildSync,
  botSync,
  logger,
})

/** サービス全体の状態を読み直し、読み上げが一時停止されたらすべての読み上げを終了する */
async function refreshState() {
  const { pausedNow } = await state.refresh()
  if (pausedNow) await sessions.stopAll("paused")
}

const handleControl = createControlHandler({
  redis,
  sessions,
  leaveGuild: (guildId) => leaveGuild(all, guildId),
  registerCommands: () => registerCommands(clients.main.rest, config.DISCORD_CLIENT_ID, config.DEV_GUILD_ID),
  logger,
})

// Web GUI からの設定変更・運営コンソールからの指示を反映する
await subscriber.subscribe(redisKeys.invalidation(), redisKeys.botCommands())
subscriber.on("message", (channel: string, raw: string) => {
  if (channel === redisKeys.botCommands()) {
    void handleControl(raw).catch((error: unknown) =>
      logger.warn({ err: error }, "failed to reply to a control command"),
    )
    return
  }
  try {
    const message = invalidationSchema.safeParse(JSON.parse(raw))
    if (!message.success) return
    if (message.data.kind === "guild") configs.invalidate(message.data.guildId)
    if (message.data.kind === "system" || message.data.kind === "user") {
      void refreshState().catch((error: unknown) => logger.warn({ err: error }, "failed to refresh the service state"))
    }
  } catch {
    // 不正な通知は無視する
  }
})
const stateRefresh = setInterval(
  () =>
    void refreshState().catch((error: unknown) => logger.warn({ err: error }, "failed to refresh the service state")),
  STATE_REFRESH_INTERVAL_MS,
)

// Web GUI の「Bot の状態」表示用
const heartbeat = setInterval(() => {
  const payload = {
    at: new Date().toISOString(),
    pingMs: Math.max(0, clients.main.ws.ping),
    guilds: clients.main.guilds.cache.size,
  }
  redis.set(redisKeys.botHeartbeat(), JSON.stringify(payload), "EX", 120).catch(() => undefined)
}, HEARTBEAT_INTERVAL_MS)

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  clearInterval(heartbeat)
  clearInterval(stateRefresh)
  try {
    await sessions.stopAll("shutdown")
    await Promise.all(all.map((c) => c.destroy()))
    await Promise.allSettled([db.$disconnect(), redis.quit(), subscriber.quit()])
  } finally {
    process.exit(0)
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
