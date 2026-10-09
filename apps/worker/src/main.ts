import { createServer } from "node:http"

import { pino } from "pino"

import { createWorkerClient } from "./client"
import { engineUrl, loadConfig } from "./config"
import { createAdapter } from "./engines"

/** バンドル時に package.json の version を埋め込む（scripts/build-app.mjs） */
declare const __APP_VERSION__: string | undefined
const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL, redact: ["token", "*.token", "*.authorization"] })

const client = createWorkerClient({
  url: config.CONTROL_SERVER,
  token: config.WORKER_TOKEN,
  adapters: config.WORKER_ENGINES.map((engine) => createAdapter(engine, engineUrl(config, engine))),
  maxConcurrency: config.MAX_CONCURRENCY,
  version,
  logger,
  engineCheckIntervalMs: config.ENGINE_CHECK_INTERVAL_MS,
  synthesisTimeoutMs: config.SYNTHESIS_TIMEOUT_MS,
})

const health =
  config.HEALTH_PORT > 0
    ? createServer((_request, response) => {
        response.writeHead(client.connected ? 200 : 503, { "content-type": "application/json" })
        response.end(JSON.stringify({ connected: client.connected, ...client.load }))
      }).listen(config.HEALTH_PORT, "127.0.0.1")
    : null

logger.info({ engines: config.WORKER_ENGINES, server: config.CONTROL_SERVER, version }, "starting worker")
client.start()

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  health?.close()
  await client.stop()
  process.exit(0)
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
