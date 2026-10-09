/**
 * Worker の WebSocket 接続。
 * - Upgrade 前にトークンを検証する（不正なら 401 で切断し、WebSocket を確立しない）
 * - 接続後は hello を待ち、エンジンと話者を登録する
 * - ハートビート（ping / pong）で生存確認とレイテンシ計測を行う
 */
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"

import { EngineHealth, verifyWorkerSecret, WorkerStatus, WorkerType, type Repositories } from "@voiloid/database"
import { ENGINES } from "@voiloid/shared"
import {
  parseWorkerToken,
  WORKER_CLOSE,
  WORKER_PROTOCOL_VERSION,
  workerMessageSchema,
  type EngineReport,
  type GatewayMessage,
} from "@voiloid/shared/protocol"
import type { Logger } from "pino"
import { WebSocketServer, type RawData, type WebSocket } from "ws"

import type { WorkerRegistry, ConnectedWorker } from "./registry"

export const WORKER_PATH = "/worker"
/** DB の lastSeenAt は書き込みを減らすため間引いて更新する */
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000
/** 1 メッセージの上限（base64 の WAV を含む） */
const MAX_PAYLOAD = 16 * 1024 * 1024

interface AuthenticatedWorker {
  id: string
  publicId: string
  name: string
  type: WorkerType
  ownerUserId: string | null
}

export interface WorkerServerOptions {
  repos: Repositories
  registry: WorkerRegistry
  logger: Logger
  heartbeatIntervalMs: number
  helloTimeoutMs: number
}

const rawText = (data: RawData) =>
  (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString("utf8")

function reject(socket: Duplex, status: number, message: string) {
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

function engineSync(reports: EngineReport[]) {
  return reports.map((e) => ({
    engineId: e.engine,
    engineType: ENGINES[e.engine].type,
    engineName: e.engine,
    engineVersion: e.version ?? null,
    health: e.healthy ? EngineHealth.HEALTHY : EngineHealth.UNHEALTHY,
  }))
}

export function createWorkerServer(options: WorkerServerOptions) {
  const { repos, registry, logger } = options
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  const alive = new WeakMap<WebSocket, { alive: boolean; pingSentAt: number; lastSeenWrite: number }>()

  async function authenticate(request: IncomingMessage): Promise<AuthenticatedWorker | null> {
    const header = request.headers.authorization ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    const parsed = parseWorkerToken(token)
    if (!parsed) return null
    const worker = await repos.workers.findForAuth(parsed.publicId)
    if (!worker?.credential || worker.credential.revokedAt || worker.deletedAt || !worker.enabled) return null
    if (!verifyWorkerSecret(parsed.secret, worker.credential.secretHash)) return null
    return {
      id: worker.id,
      publicId: worker.publicId,
      name: worker.name,
      type: worker.type,
      ownerUserId: worker.ownerUserId,
    }
  }

  const send = (socket: WebSocket, message: GatewayMessage) => socket.send(JSON.stringify(message))

  function accept(socket: WebSocket, auth: AuthenticatedWorker, remote: string | undefined) {
    let worker: ConnectedWorker | null = null
    const helloTimer = setTimeout(
      () => socket.close(WORKER_CLOSE.HELLO_TIMEOUT, "hello timeout"),
      options.helloTimeoutMs,
    )
    alive.set(socket, { alive: true, pingSentAt: 0, lastSeenWrite: Date.now() })

    socket.on("pong", () => {
      const state = alive.get(socket)
      if (!state) return
      state.alive = true
      if (!worker) return
      worker.latencyMs = Date.now() - state.pingSentAt
      worker.lastSeenAt = new Date()
      void registry.publishLive(worker)
      if (Date.now() - state.lastSeenWrite >= LAST_SEEN_WRITE_INTERVAL_MS) {
        state.lastSeenWrite = Date.now()
        void repos.workers
          .updateStatus(worker.id, WorkerStatus.ONLINE, { lastSeenAt: worker.lastSeenAt })
          .catch(() => undefined)
      }
    })

    socket.on("message", (data, isBinary) => {
      if (isBinary) return
      let message
      try {
        message = workerMessageSchema.safeParse(JSON.parse(rawText(data)))
      } catch {
        return
      }
      if (!message.success) {
        logger.warn({ worker: auth.publicId }, "invalid message from worker")
        if (!worker) socket.close(WORKER_CLOSE.INVALID_HELLO, "invalid hello")
        return
      }
      const msg = message.data

      if (!worker) {
        if (msg.type !== "hello" || msg.protocolVersion !== WORKER_PROTOCOL_VERSION) {
          socket.close(WORKER_CLOSE.INVALID_HELLO, "unsupported protocol")
          return
        }
        clearTimeout(helloTimer)
        worker = {
          id: auth.id,
          publicId: auth.publicId,
          name: auth.name,
          type: auth.type === WorkerType.OFFICIAL ? "official" : "private",
          ownerUserId: auth.ownerUserId,
          socket,
          engines: new Map(msg.engines.map((e) => [e.engine, e])),
          maxConcurrency: msg.maxConcurrency,
          version: msg.workerVersion,
          pending: new Map(),
          failures: 0,
          latencyMs: undefined,
          lastSeenAt: new Date(),
        }
        const previous = registry.add(worker)
        if (previous) previous.socket.close(WORKER_CLOSE.REPLACED, "replaced by a new connection")
        const connectedWorker = worker
        void (async () => {
          try {
            await repos.workers.updateStatus(connectedWorker.id, WorkerStatus.ONLINE, {
              lastSeenAt: connectedWorker.lastSeenAt,
              version: msg.workerVersion,
              maxConcurrency: msg.maxConcurrency,
            })
            await repos.workers.syncEngines(connectedWorker.id, engineSync(msg.engines), connectedWorker.lastSeenAt)
          } catch (error) {
            logger.error({ err: error, worker: auth.publicId }, "failed to persist worker status")
          }
          await registry.publishLive(connectedWorker)
        })()
        send(socket, {
          type: "welcome",
          workerId: auth.publicId,
          name: auth.name,
          heartbeatIntervalMs: options.heartbeatIntervalMs,
        })
        logger.info(
          { worker: auth.publicId, remote, engines: msg.engines.map((e) => e.engine), version: msg.workerVersion },
          "worker connected",
        )
        return
      }

      switch (msg.type) {
        case "hello":
          return
        case "engines": {
          worker.engines = new Map(msg.engines.map((e) => [e.engine, e]))
          void repos.workers.syncEngines(worker.id, engineSync(msg.engines), new Date()).catch(() => undefined)
          void registry.publishLive(worker)
          return
        }
        case "result":
          registry.complete(worker, msg)
          return
      }
    })

    socket.on("close", (code) => {
      clearTimeout(helloTimer)
      if (!worker) return
      registry.failAll(worker, `worker ${worker.publicId} disconnected`)
      // 新しい接続に置き換わった場合は状態を変えない
      if (registry.remove(worker)) {
        void registry.clearLive(worker)
        void repos.workers.updateStatus(worker.id, WorkerStatus.OFFLINE).catch(() => undefined)
      }
      logger.info({ worker: worker.publicId, code }, "worker disconnected")
    })

    socket.on("error", (error) => logger.warn({ err: error, worker: auth.publicId }, "worker socket error"))
  }

  /** 応答しない Worker を切断し、生きている Worker のレイテンシを測る */
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      const state = alive.get(socket)
      if (!state) continue
      if (!state.alive) {
        socket.terminate()
        continue
      }
      state.alive = false
      state.pingSentAt = Date.now()
      socket.ping()
    }
  }, options.heartbeatIntervalMs)
  heartbeat.unref()

  return {
    /** HTTP サーバーの upgrade イベントから呼ぶ */
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      const path = new URL(request.url ?? "/", "http://localhost").pathname
      if (path !== WORKER_PATH) {
        reject(socket, 404, "Not Found")
        return
      }
      authenticate(request)
        .then((auth) => {
          if (!auth) {
            reject(socket, 401, "Unauthorized")
            return
          }
          wss.handleUpgrade(request, socket, head, (ws) => accept(ws, auth, request.socket.remoteAddress))
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, "worker authentication failed")
          reject(socket, 503, "Service Unavailable")
        })
    },

    /** Worker の削除・トークン再発行: 接続を切る（再接続時に再認証される） */
    disconnect(publicId: string) {
      registry.findByPublicId(publicId)?.socket.close(WORKER_CLOSE.DISABLED, "worker updated")
    },

    async close() {
      clearInterval(heartbeat)
      for (const socket of wss.clients) socket.close(1001, "gateway shutting down")
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}

export type WorkerServer = ReturnType<typeof createWorkerServer>
