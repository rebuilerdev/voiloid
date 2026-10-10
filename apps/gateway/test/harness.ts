/**
 * Gateway の統合テスト用ハーネス: 実 PostgreSQL / Redis と、偽の Worker（WebSocket クライアント）。
 */
import {
  createRepositories,
  generatePublicId,
  generateWorkerCredential,
  registerWorker,
  WorkerType,
  type Database,
} from "@voiloid/database"
import { createTestDatabase, resetTestDatabase } from "@voiloid/database/testing"
import type { EngineId } from "@voiloid/shared"
import {
  INTERNAL_API_PREFIX,
  gatewayMessageSchema,
  WORKER_PROTOCOL_VERSION,
  type EngineReport,
  type SynthesizeJob,
} from "@voiloid/shared/protocol"
import { Redis } from "ioredis"
import { pino } from "pino"
import WebSocket from "ws"

import { assertTestRedis, TEST_REDIS_URL } from "../../../test/env"
import { createGateway, type Gateway } from "../src/gateway"

export const INTERNAL_TOKEN = "t".repeat(40)

export interface GatewayHarness {
  db: Database
  redis: Redis
  gateway: Gateway
  workerUrl: string
  internalUrl: string
}

export function createGatewayHarness(options: { jobTimeoutMs?: number; heartbeatIntervalMs?: number } = {}) {
  assertTestRedis(TEST_REDIS_URL)
  const db = createTestDatabase()
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true })
  let subscriber: Redis | undefined
  let gateway: Gateway | undefined
  const workers: FakeWorker[] = []

  return {
    workers,
    async setup(): Promise<GatewayHarness> {
      await resetTestDatabase(db)
      if (redis.status === "wait") await redis.connect()
      await redis.flushdb()
      subscriber = new Redis(TEST_REDIS_URL)
      gateway = createGateway({
        db,
        repos: createRepositories(db),
        redis,
        subscriber,
        logger: pino({ level: "silent" }),
        internalToken: INTERNAL_TOKEN,
        jobTimeoutMs: options.jobTimeoutMs ?? 1_000,
        heartbeatIntervalMs: options.heartbeatIntervalMs ?? 60_000,
        helloTimeoutMs: 300,
      })
      const ports = await gateway.start({ host: "127.0.0.1", workerPort: 0, internalPort: 0 })
      return {
        db,
        redis,
        gateway,
        workerUrl: `ws://127.0.0.1:${ports.workerPort}/worker`,
        internalUrl: `http://127.0.0.1:${ports.internalPort}`,
      }
    },
    async cleanup() {
      for (const w of workers.splice(0)) w.close()
      await gateway?.stop()
      subscriber?.disconnect()
    },
    async teardown() {
      await db.$disconnect()
      redis.disconnect()
    },
  }
}

/** Worker を DB に登録し、接続トークンを返す */
export async function registerTestWorker(
  db: Database,
  options: { type?: WorkerType; ownerUserId?: string | null; name?: string; engines?: EngineId[] } = {},
) {
  const publicId = generatePublicId()
  const credential = generateWorkerCredential(publicId)
  const worker = await registerWorker(db, {
    publicId,
    name: options.name ?? `worker-${publicId.slice(0, 4)}`,
    engines: options.engines ?? ["VOICEVOX"],
    secretHash: credential.secretHash,
    type: options.type ?? WorkerType.OFFICIAL,
    ownerUserId: options.type === WorkerType.PRIVATE ? (options.ownerUserId ?? null) : null,
  })
  return { worker, token: credential.token }
}

export const engine = (id: EngineId, speakers: [string, string[]][], healthy = true): EngineReport => ({
  engine: id,
  version: "1.0.0",
  healthy,
  speakers: speakers.map(([speakerId, styles]) => ({
    id: speakerId,
    name: `speaker-${speakerId}`,
    styles: styles.map((s) => ({ id: s, name: `style-${s}` })),
  })),
})

type Behavior = (job: SynthesizeJob) => { ok: true; audio: Buffer } | { ok: false; error: string } | "ignore"

/** 偽の Worker。受け取ったジョブを記録し、behavior に従って応答する */
export class FakeWorker {
  socket: WebSocket | undefined
  jobs: SynthesizeJob[] = []
  /** Gateway から届いた configure（同時処理の数） */
  configured: number[] = []
  closeCode: number | undefined
  behavior: Behavior = () => ({ ok: true, audio: Buffer.from(`audio:${this.name}`) })

  constructor(
    readonly url: string,
    readonly token: string,
    readonly engines: EngineReport[],
    readonly name = "fake",
    readonly maxConcurrency = 2,
  ) {}

  /** 接続し、hello を送って welcome を待つ */
  async connect(
    options: { hello?: unknown; protocolVersion?: number; capabilities?: string[] } = {},
  ): Promise<unknown> {
    const socket = new WebSocket(this.url, { headers: { Authorization: `Bearer ${this.token}` } })
    this.socket = socket
    socket.on("close", (code) => (this.closeCode = code))
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve())
      socket.once("error", reject)
    })
    const welcome = new Promise<unknown>((resolve, reject) => {
      socket.once("message", (data: Buffer) => resolve(JSON.parse(data.toString())))
      socket.once("close", (code) => reject(new Error(`closed: ${code}`)))
    })
    socket.on("message", (data: Buffer) => {
      const message = gatewayMessageSchema.safeParse(JSON.parse(data.toString()))
      if (message.success && message.data.type === "configure") {
        this.configured.push(message.data.maxConcurrency)
        return
      }
      if (!message.success || message.data.type !== "synthesize") return
      const job = message.data
      this.jobs.push(job)
      const result = this.behavior(job)
      if (result === "ignore") return
      socket.send(
        JSON.stringify(
          result.ok
            ? { type: "result", jobId: job.jobId, ok: true, audio: result.audio.toString("base64") }
            : { type: "result", jobId: job.jobId, ok: false, error: result.error },
        ),
      )
    })
    socket.send(
      JSON.stringify(
        options.hello ?? {
          type: "hello",
          protocolVersion: options.protocolVersion ?? WORKER_PROTOCOL_VERSION,
          workerVersion: "1.2.3",
          maxConcurrency: this.maxConcurrency,
          engines: this.engines,
          ...(options.capabilities ? { capabilities: options.capabilities } : {}),
        },
      ),
    )
    return welcome
  }

  waitForClose(): Promise<number> {
    if (this.closeCode !== undefined) return Promise.resolve(this.closeCode)
    return new Promise((resolve) => this.socket?.once("close", (code) => resolve(code)))
  }

  close() {
    this.socket?.close()
  }
}

export async function internal(
  h: GatewayHarness,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  token = INTERNAL_TOKEN,
) {
  return fetch(`${h.internalUrl}${INTERNAL_API_PREFIX}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const until = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await new Promise((r) => setTimeout(r, 20))
  }
}
