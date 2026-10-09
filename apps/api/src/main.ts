import { createDatabase, createRepositories } from "@voiloid/database"
import { Redis } from "ioredis"

import { buildApp, LOG_REDACT } from "./app"
import { loadConfig } from "./config"
import { createBotCommander } from "./lib/bot-commands"
import { createDiscordApi } from "./lib/discord"
import { createGatewayClient } from "./lib/gateway"
import { createSessionStore } from "./lib/session"
import { createS3Storage } from "./lib/storage"

const config = loadConfig()

const db = createDatabase({ url: config.DATABASE_URL, maxConnections: config.DATABASE_POOL_SIZE })
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 })

const app = buildApp(
  {
    config,
    db,
    repos: createRepositories(db),
    redis,
    discord: createDiscordApi({
      apiBase: config.DISCORD_API_BASE,
      clientId: config.DISCORD_CLIENT_ID,
      clientSecret: config.DISCORD_CLIENT_SECRET,
      botToken: config.DISCORD_BOT_TOKEN,
    }),
    gateway: createGatewayClient({ baseUrl: config.GATEWAY_INTERNAL_URL, token: config.INTERNAL_API_TOKEN }),
    storage: createS3Storage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    }),
    sessions: createSessionStore(redis, {
      ttlSeconds: config.SESSION_TTL_SECONDS,
      encryptionKey: Buffer.from(config.SESSION_ENCRYPTION_KEY, "base64"),
    }),
    bot: createBotCommander(redis),
    now: () => new Date(),
  },
  { logger: { level: config.LOG_LEVEL, redact: { paths: LOG_REDACT, censor: "[redacted]" } } },
)

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down")
  try {
    await app.close()
    await Promise.allSettled([db.$disconnect(), redis.quit()])
  } finally {
    process.exit(0)
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))

await app.listen({ host: config.HOST, port: config.PORT })
