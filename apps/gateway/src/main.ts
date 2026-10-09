import { createDatabase, createRepositories } from "@voiloid/database"
import { Redis } from "ioredis"
import { pino } from "pino"

import { loadConfig } from "./config"
import { createGateway } from "./gateway"

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL, redact: ["*.token", "*.authorization", "*.audio"] })

const db = createDatabase({ url: config.DATABASE_URL, maxConnections: config.DATABASE_POOL_SIZE })
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 })
const subscriber = new Redis(config.REDIS_URL)

const gateway = createGateway({
  db,
  repos: createRepositories(db),
  redis,
  subscriber,
  logger,
  internalToken: config.INTERNAL_API_TOKEN,
  jobTimeoutMs: config.JOB_TIMEOUT_MS,
  heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
  helloTimeoutMs: config.HELLO_TIMEOUT_MS,
})

const ports = await gateway.start({
  host: config.HOST,
  workerPort: config.WORKER_PORT,
  internalPort: config.INTERNAL_PORT,
})
logger.info(ports, "gateway listening")

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  try {
    await gateway.stop()
    await Promise.allSettled([db.$disconnect(), redis.quit(), subscriber.quit()])
  } finally {
    process.exit(0)
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
