import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { WORKER_CLOSE } from "@voiloid/shared/protocol"
import { pino } from "pino"
import { afterEach, describe, expect, it } from "vitest"
import { WebSocketServer, type WebSocket } from "ws"

import { createLimiter, createWorkerClient, type WorkerClient } from "./client"
import type { EngineAdapter } from "./engines"

const TOKEN = `wkr_${"A".repeat(20)}.${"s".repeat(43)}`

/** 偽の Gateway: 接続・受信メッセージを記録する */
async function startFakeGateway(options: { reject401?: boolean } = {}) {
  const server: Server = createServer()
  const wss = new WebSocketServer({ noServer: true })
  const sockets: WebSocket[] = []
  const messages: Record<string, unknown>[] = []
  const authorizations: (string | undefined)[] = []
  server.on("upgrade", (request, socket, head) => {
    authorizations.push(request.headers.authorization)
    if (options.reject401) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n")
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      sockets.push(ws)
      ws.on("message", (data: Buffer) => messages.push(JSON.parse(data.toString()) as Record<string, unknown>))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/worker`,
    sockets,
    messages,
    authorizations,
    send: (message: unknown, index = sockets.length - 1) => sockets[index]?.send(JSON.stringify(message)),
    close: async () => {
      for (const s of sockets) s.terminate()
      await new Promise<void>((resolve) => wss.close(() => server.close(() => resolve())))
    },
  }
}

const until = async (predicate: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timeout")
    await new Promise((r) => setTimeout(r, 10))
  }
}

function adapter(patch: Partial<EngineAdapter> = {}): EngineAdapter {
  return {
    id: "VOICEVOX",
    report: () => Promise.resolve({ engine: "VOICEVOX", version: "1", healthy: true, speakers: [] }),
    synthesize: () => Promise.resolve(Buffer.from("wav")),
    ...patch,
  }
}

let client: WorkerClient | undefined
let gateway: Awaited<ReturnType<typeof startFakeGateway>> | undefined

afterEach(async () => {
  await client?.stop()
  await gateway?.close()
  client = undefined
})

function start(adapters: EngineAdapter[], options: { engineCheckIntervalMs?: number; maxConcurrency?: number } = {}) {
  client = createWorkerClient({
    url: gateway!.url,
    token: TOKEN,
    adapters,
    maxConcurrency: options.maxConcurrency ?? 2,
    version: "1.2.3",
    logger: pino({ level: "silent" }),
    engineCheckIntervalMs: options.engineCheckIntervalMs ?? 60_000,
    synthesisTimeoutMs: 1_000,
    backoff: { initialMs: 20, maxMs: 80, rejectedMs: 400 },
  })
  client.start()
  return client
}

const job = (patch: Record<string, unknown> = {}) => ({
  type: "synthesize",
  jobId: "3f0b8f6e-6d0a-4b6e-9a51-2a3c1b0e9f11",
  engine: "VOICEVOX",
  speakerId: "s",
  styleId: "1",
  text: "テスト",
  speed: 1,
  pitch: 0,
  intonation: 1,
  ...patch,
})

describe("createWorkerClient", () => {
  it("トークンを付けて接続し、エンジンの一覧を hello で送る。welcome で接続済みになる", async () => {
    gateway = await startFakeGateway()
    const c = start([adapter(), adapter({ id: "AivisSpeech", report: () => Promise.reject(new Error("down")) })])
    await until(() => gateway!.messages.length === 1)
    expect(gateway.authorizations[0]).toBe(`Bearer ${TOKEN}`)
    expect(gateway.messages[0]).toEqual({
      type: "hello",
      protocolVersion: 1,
      workerVersion: "1.2.3",
      maxConcurrency: 2,
      engines: [
        { engine: "VOICEVOX", version: "1", healthy: true, speakers: [] },
        // 起動していないエンジンは異常として申告する
        { engine: "AivisSpeech", healthy: false, speakers: [] },
      ],
      // 同時処理の数を Gateway から変えられることを申告する
      capabilities: ["configure"],
    })
    expect(c.connected).toBe(false)
    gateway.send({ type: "welcome", workerId: "w", name: "n", heartbeatIntervalMs: 1000 })
    await until(() => c.connected)
  })

  it("合成ジョブを実行して結果を返す。失敗・未対応のエンジンはエラーを返す", async () => {
    gateway = await startFakeGateway()
    let fail = false
    start([
      adapter({ synthesize: () => (fail ? Promise.reject(new Error("boom")) : Promise.resolve(Buffer.from("wav"))) }),
    ])
    await until(() => gateway!.messages.length === 1)

    gateway.send(job())
    await until(() => gateway!.messages.length === 2)
    expect(gateway.messages[1]).toEqual({
      type: "result",
      jobId: "3f0b8f6e-6d0a-4b6e-9a51-2a3c1b0e9f11",
      ok: true,
      audio: Buffer.from("wav").toString("base64"),
    })

    fail = true
    gateway.send(job())
    await until(() => gateway!.messages.length === 3)
    expect(gateway.messages[2]).toMatchObject({ ok: false, error: "boom" })

    gateway.send(job({ engine: "COEIROINK" }))
    await until(() => gateway!.messages.length === 4)
    expect(gateway.messages[3]).toMatchObject({ ok: false, error: expect.stringContaining("not enabled") })

    // 不正なメッセージは無視する
    gateway.sockets[0]?.send("not json")
    gateway.send({ type: "unknown" })
  })

  it("refresh でエンジン一覧を送り直し、状態が変わったら自動で知らせる", async () => {
    gateway = await startFakeGateway()
    let healthy = true
    start([adapter({ report: () => Promise.resolve({ engine: "VOICEVOX", healthy, speakers: [] }) })], {
      engineCheckIntervalMs: 30,
    })
    await until(() => gateway!.messages.length === 1)
    gateway.send({ type: "welcome", workerId: "w", name: "n", heartbeatIntervalMs: 1000 })
    gateway.send({ type: "refresh" })
    await until(() => gateway!.messages.length === 2)
    expect(gateway.messages[1]).toMatchObject({ type: "engines" })

    healthy = false
    await until(() =>
      gateway!.messages.some((m) => m.type === "engines" && JSON.stringify(m).includes('"healthy":false')),
    )
  })

  it("configure で同時処理の数を変える（MAX_CONCURRENCY より大きくできる）", async () => {
    gateway = await startFakeGateway()
    const releases: (() => void)[] = []
    const blocking = adapter({
      synthesize: () => new Promise<Buffer>((resolve) => releases.push(() => resolve(Buffer.from("wav")))),
    })
    start([blocking], { maxConcurrency: 1 })
    await until(() => gateway!.messages.length === 1)
    gateway.send({ type: "welcome", workerId: "w", name: "n", heartbeatIntervalMs: 1000 })
    gateway.send({ type: "configure", maxConcurrency: 3 })
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ]
    for (const jobId of ids) gateway.send(job({ jobId }))
    // MAX_CONCURRENCY = 1 でも、3 件を同時に処理する
    await until(() => releases.length === 3)
    for (const release of releases) release()
    await until(() => gateway!.messages.filter((m) => m.type === "result").length === 3)
  })

  it("切断されたら再接続する", async () => {
    gateway = await startFakeGateway()
    start([adapter()])
    await until(() => gateway!.sockets.length === 1)
    gateway.sockets[0]?.close(1011)
    await until(() => gateway!.sockets.length === 2)
  })

  it("運営者に切断された場合（RECONNECT）は、すぐに再接続する", async () => {
    gateway = await startFakeGateway()
    start([adapter()])
    await until(() => gateway!.sockets.length === 1)
    const closedAt = Date.now()
    gateway.sockets[0]?.close(WORKER_CLOSE.RECONNECT)
    await until(() => gateway!.sockets.length === 2)
    // 無効化（rejectedMs = 400）より早い
    expect(Date.now() - closedAt).toBeLessThan(300)
  })

  it("無効化された場合・トークンが拒否された場合は長めに待ってから再接続する", async () => {
    gateway = await startFakeGateway()
    start([adapter()])
    await until(() => gateway!.sockets.length === 1)
    const closedAt = Date.now()
    gateway.sockets[0]?.close(WORKER_CLOSE.DISABLED)
    await until(() => gateway!.sockets.length === 2, 3000)
    expect(Date.now() - closedAt).toBeGreaterThanOrEqual(300)
    await client?.stop()
    await gateway.close()

    gateway = await startFakeGateway({ reject401: true })
    start([adapter()])
    await until(() => gateway!.authorizations.length === 1)
    await new Promise((r) => setTimeout(r, 200))
    expect(gateway.authorizations).toHaveLength(1)
    await until(() => gateway!.authorizations.length === 2, 3000)
  })
})

describe("createLimiter", () => {
  it("同時実行数を超えたジョブは順番待ちにする", async () => {
    const limiter = createLimiter(2)
    const releases: (() => void)[] = []
    const task = () => new Promise<void>((resolve) => releases.push(resolve))
    const runs = [limiter.run(task), limiter.run(task), limiter.run(task)]
    await until(() => releases.length === 2)
    expect(limiter.running).toBe(2)
    expect(limiter.waiting).toBe(1)
    releases[0]!()
    await until(() => releases.length === 3)
    releases[1]!()
    releases[2]!()
    await Promise.all(runs)
    expect(limiter.running).toBe(0)
  })

  it("同時実行数を変えると、増やした分だけ待っているジョブを始め、減らした後は新しいジョブを待たせる", async () => {
    const limiter = createLimiter(1)
    const releases: (() => void)[] = []
    const task = () => new Promise<void>((resolve) => releases.push(resolve))
    const runs = [limiter.run(task), limiter.run(task), limiter.run(task)]
    await until(() => releases.length === 1)
    limiter.setConcurrency(3)
    await until(() => releases.length === 3)
    expect(limiter.running).toBe(3)
    limiter.setConcurrency(1)
    const fourth = limiter.run(task)
    for (const release of releases.splice(0, 2)) release()
    await new Promise((r) => setTimeout(r, 20))
    // まだ 1 件実行中なので、4 件目は待つ
    expect(limiter.waiting).toBe(1)
    releases.shift()?.()
    await until(() => releases.length === 1)
    releases.shift()?.()
    await Promise.all([...runs, fourth])
    expect(limiter.running).toBe(0)
  })

  it("失敗したジョブも枠を解放する", async () => {
    const limiter = createLimiter(1)
    await expect(limiter.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x")
    await expect(limiter.run(() => Promise.resolve(1))).resolves.toBe(1)
  })
})
