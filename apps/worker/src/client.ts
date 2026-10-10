/**
 * Worker Gateway への接続。
 * - Worker 側から接続するため、Worker のマシンでポートを開放する必要はない
 * - 切断されたら指数バックオフで再接続する（トークンが拒否された場合は長めに待つ）
 * - 同時に合成するジョブの数を制限し、超えた分は順番待ちにする
 */
import {
  gatewayMessageSchema,
  WORKER_CLOSE,
  WORKER_CAPABILITY,
  WORKER_PROTOCOL_VERSION,
  type EngineReport,
  type SynthesizeJob,
} from "@voiloid/shared/protocol"
import type { Logger } from "pino"
import WebSocket, { type RawData } from "ws"

import type { EngineAdapter } from "./engines"

export interface WorkerClientOptions {
  url: string
  token: string
  adapters: EngineAdapter[]
  maxConcurrency: number
  version: string
  logger: Logger
  engineCheckIntervalMs: number
  synthesisTimeoutMs: number
  /** 再接続の待ち時間（テストで短くする） */
  backoff?: { initialMs: number; maxMs: number; rejectedMs: number }
}

const DEFAULT_BACKOFF = { initialMs: 1_000, maxMs: 30_000, rejectedMs: 60_000 }

const rawText = (data: RawData) =>
  (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)).toString("utf8")

/** 同時実行数の制限（実行中に変えられる） */
export function createLimiter(concurrency: number) {
  let running = 0
  const queue: (() => void)[] = []
  /** 空きがあれば、待っているタスクに枠を割り当てて始める（枠は割り当てる側で数える） */
  const drain = () => {
    while (running < concurrency && queue.length > 0) {
      running++
      queue.shift()?.()
    }
  }
  return {
    /** 同時実行数を変える。増やした分だけ、待っているタスクをすぐに始める */
    setConcurrency(next: number) {
      concurrency = next
      drain()
    },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (running < concurrency && queue.length === 0) running++
      else await new Promise<void>((resolve) => queue.push(resolve))
      try {
        return await task()
      } finally {
        running--
        drain()
      }
    },
    get running() {
      return running
    },
    get waiting() {
      return queue.length
    },
  }
}

export function createWorkerClient(options: WorkerClientOptions) {
  const { logger } = options
  const backoff = options.backoff ?? DEFAULT_BACKOFF
  const adapters = new Map(options.adapters.map((a) => [a.id, a]))
  const limiter = createLimiter(options.maxConcurrency)

  let socket: WebSocket | null = null
  let connected = false
  let stopped = false
  let delay = backoff.initialMs
  let reconnectTimer: NodeJS.Timeout | undefined
  let lastReports = ""
  /** 接続ごとの中断（切断時に実行中の合成を止める） */
  let connectionAbort = new AbortController()

  async function collectReports(): Promise<EngineReport[]> {
    return Promise.all(
      options.adapters.map(async (adapter) => {
        try {
          return await adapter.report()
        } catch (error) {
          logger.warn({ engine: adapter.id, err: error }, "engine is not reachable")
          return { engine: adapter.id, healthy: false, speakers: [] }
        }
      }),
    )
  }

  function send(message: unknown) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  async function handleJob(job: SynthesizeJob, signal: AbortSignal) {
    const started = Date.now()
    try {
      const adapter = adapters.get(job.engine)
      if (!adapter) throw new Error(`engine ${job.engine} is not enabled on this worker`)
      const audio = await limiter.run(() =>
        adapter.synthesize(
          {
            speakerId: job.speakerId,
            styleId: job.styleId,
            text: job.text,
            speed: job.speed,
            pitch: job.pitch,
            intonation: job.intonation,
          },
          AbortSignal.any([signal, AbortSignal.timeout(options.synthesisTimeoutMs)]),
        ),
      )
      send({ type: "result", jobId: job.jobId, ok: true, audio: audio.toString("base64") })
      logger.debug({ engine: job.engine, ms: Date.now() - started }, "synthesized")
    } catch (error) {
      logger.warn({ engine: job.engine, err: error }, "synthesis failed")
      send({ type: "result", jobId: job.jobId, ok: false, error: error instanceof Error ? error.message : "failed" })
    }
  }

  function scheduleReconnect(waitMs: number) {
    if (stopped) return
    // 一斉に再接続しないよう ±20% ずらす
    const jitter = waitMs * (0.8 + Math.random() * 0.4)
    logger.info({ seconds: Math.round(jitter / 1000) }, "reconnecting")
    reconnectTimer = setTimeout(connect, jitter)
  }

  function connect() {
    if (stopped) return
    connectionAbort = new AbortController()
    const ws = new WebSocket(options.url, {
      headers: { Authorization: `Bearer ${options.token}` },
      handshakeTimeout: 10_000,
    })
    socket = ws
    let rejected = false

    ws.on("unexpected-response", (_request, response) => {
      rejected = response.statusCode === 401
      logger.error(
        { status: response.statusCode },
        rejected
          ? "the gateway rejected the token (regenerate it in the web console)"
          : "unexpected response from the gateway",
      )
      ws.terminate()
    })

    ws.on("open", () => {
      void collectReports().then((engines) => {
        lastReports = JSON.stringify(engines)
        send({
          type: "hello",
          protocolVersion: WORKER_PROTOCOL_VERSION,
          workerVersion: options.version,
          maxConcurrency: options.maxConcurrency,
          engines,
          capabilities: [WORKER_CAPABILITY.configure],
        })
      })
    })

    ws.on("message", (data) => {
      let parsed
      try {
        parsed = gatewayMessageSchema.safeParse(JSON.parse(rawText(data)))
      } catch {
        return
      }
      if (!parsed.success) return
      const message = parsed.data
      switch (message.type) {
        case "welcome":
          connected = true
          delay = backoff.initialMs
          logger.info({ worker: message.workerId, name: message.name }, "connected to the gateway")
          return
        case "synthesize":
          void handleJob(message, connectionAbort.signal)
          return
        case "refresh":
          void collectReports().then((engines) => send({ type: "engines", engines }))
          return
        case "configure":
          // Web で設定した同時処理の数（MAX_CONCURRENCY より大きくも小さくもできる）
          limiter.setConcurrency(message.maxConcurrency)
          logger.info({ maxConcurrency: message.maxConcurrency }, "concurrency updated by the gateway")
          return
      }
    })

    ws.on("close", (code, reason) => {
      connected = false
      connectionAbort.abort()
      if (stopped) return
      logger.warn({ code, reason: reason.toString() }, "disconnected from the gateway")
      const permanent = rejected || code === WORKER_CLOSE.DISABLED || code === WORKER_CLOSE.INVALID_HELLO
      scheduleReconnect(permanent ? backoff.rejectedMs : delay)
      if (!permanent) delay = Math.min(delay * 2, backoff.maxMs)
    })

    ws.on("error", (error) => logger.debug({ err: error }, "socket error"))
  }

  /** エンジンの状態が変わったら Gateway に知らせる */
  const engineCheck = setInterval(() => {
    if (!connected) return
    void collectReports().then((engines) => {
      const serialized = JSON.stringify(engines)
      if (serialized === lastReports) return
      lastReports = serialized
      send({ type: "engines", engines })
    })
  }, options.engineCheckIntervalMs)
  engineCheck.unref()

  return {
    start() {
      stopped = false
      connect()
    },
    get connected() {
      return connected
    },
    get load() {
      return { running: limiter.running, waiting: limiter.waiting }
    },
    async stop() {
      stopped = true
      clearTimeout(reconnectTimer)
      clearInterval(engineCheck)
      if (!socket || socket.readyState === WebSocket.CLOSED) return
      const ws = socket
      await new Promise<void>((resolve) => {
        ws.once("close", () => resolve())
        ws.close(1000, "worker shutting down")
      })
    },
  }
}

export type WorkerClient = ReturnType<typeof createWorkerClient>
