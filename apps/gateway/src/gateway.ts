/**
 * Worker Gateway の組み立て（テストからも起動・停止できるようにする）。
 */
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import type { Database, Repositories } from "@voiloid/database"
import { invalidationSchema, redisKeys } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"
import type { Logger } from "pino"

import { createInternalApi } from "./internal-api"
import { WorkerRegistry } from "./registry"
import { createRouter } from "./router"
import { createWorkerServer } from "./worker-server"

export interface GatewayOptions {
  db: Database
  repos: Repositories
  redis: Redis
  /** Pub/Sub 用の接続（購読中の接続では通常のコマンドを使えないため分ける） */
  subscriber: Redis
  logger: Logger
  internalToken: string
  jobTimeoutMs: number
  heartbeatIntervalMs: number
  helloTimeoutMs: number
}

const listen = (server: Server, host: string, port: number) =>
  new Promise<number>((resolve) => server.listen(port, host, () => resolve((server.address() as AddressInfo).port)))

export function createGateway(options: GatewayOptions) {
  const registry = new WorkerRegistry(options.redis, options.jobTimeoutMs)
  const router = createRouter({ repos: options.repos, registry, logger: options.logger })
  const workers = createWorkerServer({
    repos: options.repos,
    registry,
    logger: options.logger,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    helloTimeoutMs: options.helloTimeoutMs,
  })

  const workerHttp = createServer((_request, response) => {
    // Worker 用ポートは WebSocket と生存確認だけを受け付ける
    response.writeHead(_request.url === "/healthz" ? 200 : 404).end()
  })
  workerHttp.on("upgrade", (request, socket, head) => workers.handleUpgrade(request, socket, head))

  const internalHttp = createServer(
    createInternalApi({
      token: options.internalToken,
      router,
      logger: options.logger,
      ready: async () => {
        try {
          await Promise.all([options.db.$queryRaw`SELECT 1`, options.redis.ping()])
          return true
        } catch {
          return false
        }
      },
    }),
  )

  options.subscriber.on("message", (_channel: string, raw: string) => {
    let message
    try {
      message = invalidationSchema.safeParse(JSON.parse(raw))
    } catch {
      return
    }
    if (!message.success) return
    const event = message.data
    switch (event.kind) {
      case "guild":
        router.invalidateGuild(event.guildId)
        return
      case "user":
        router.invalidateUser(event.userId)
        return
      case "worker":
        // 振り分けを再計算し、接続中の Worker に反映する（削除・再発行・メンテナンスなら切断する）
        router.invalidateAll()
        void workers
          .refresh(event.workerId, { reconnect: event.reconnect === true })
          .catch((error: unknown) =>
            options.logger.warn({ err: error, worker: event.workerId }, "failed to refresh a worker"),
          )
        return
      case "system":
        // サービス全体の設定は Bot が扱う（合成の振り分けには影響しない）
        return
      case "routing":
        // 公式Worker の担当サーバーの変更など。Worker は切断しない
        router.invalidateAll()
        return
    }
  })

  return {
    registry,
    router,

    async start(ports: { host: string; workerPort: number; internalPort: number }) {
      // 前回のプロセスで接続中のまま終わった Worker の状態を戻す
      const reset = await options.repos.workers.resetOnlineStatuses()
      if (reset > 0) options.logger.info({ count: reset }, "reset stale worker statuses")
      await options.subscriber.subscribe(redisKeys.invalidation())
      const workerPort = await listen(workerHttp, ports.host, ports.workerPort)
      const internalPort = await listen(internalHttp, ports.host, ports.internalPort)
      return { workerPort, internalPort }
    },

    async stop() {
      await workers.close()
      await Promise.all([
        new Promise((resolve) => workerHttp.close(resolve)),
        new Promise((resolve) => internalHttp.close(resolve)),
      ])
      await options.subscriber.unsubscribe().catch(() => undefined)
    },
  }
}

export type Gateway = ReturnType<typeof createGateway>
