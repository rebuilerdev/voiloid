/**
 * End-to-End: Worker（本物）→ Worker Gateway（本物、実 DB / Redis）→ 内部 API で合成。
 * 音声エンジンは偽物。VOICEVOX_E2E_URL を指定すると実際の VOICEVOX でも確認する。
 */
import { WorkerType } from "@voiloid/database"
import { createTestGuild } from "@voiloid/database/testing"
import { pino } from "pino"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createGatewayHarness,
  internal,
  registerTestWorker,
  until,
  type GatewayHarness,
} from "../../gateway/test/harness"
import { startFakeEngine, type FakeEngine } from "../test/fake-engine"
import { createWorkerClient, type WorkerClient } from "./client"
import { createAdapter } from "./engines"

// 実エンジン（CPU）の合成には数秒かかることがある
const harness = createGatewayHarness({ jobTimeoutMs: 20_000 })
let h: GatewayHarness
let engine: FakeEngine
let client: WorkerClient | undefined

beforeEach(async () => {
  h = await harness.setup()
  engine = await startFakeEngine("voicevox")
})
afterEach(async () => {
  await client?.stop()
  client = undefined
  await engine.close()
  await harness.cleanup()
})
afterAll(() => harness.teardown())

function startWorker(token: string, engineUrl: string) {
  client = createWorkerClient({
    url: h.workerUrl,
    token,
    adapters: [createAdapter("VOICEVOX", engineUrl)],
    maxConcurrency: 2,
    version: "e2e",
    logger: pino({ level: "silent" }),
    engineCheckIntervalMs: 60_000,
    synthesisTimeoutMs: 20_000,
  })
  client.start()
  return client
}

describe("Worker ⇄ Gateway", () => {
  it("Worker が接続し、Bot の合成依頼をエンジンで合成して返す", async () => {
    const guild = await createTestGuild(h.db)
    await h.db.guildSettings.create({ data: { guildId: guild.id, voiceSpeakerId: "zunda-uuid", voiceStyleId: "3" } })
    const { worker, token } = await registerTestWorker(h.db, { type: WorkerType.OFFICIAL })
    const c = startWorker(token, engine.url)
    await until(() => c.connected)

    const res = await internal(h, "POST", "/synthesize", {
      guildId: guild.discordGuildId,
      userId: null,
      text: "こんにちは",
    })
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("wav:3")
    expect(res.headers.get("x-worker-id")).toBe(worker.publicId)
    expect(engine.requests.some((r) => r.path.startsWith("/audio_query"))).toBe(true)

    // Worker の申告が DB に反映される
    await until(async () => (await h.db.worker.findUniqueOrThrow({ where: { id: worker.id } })).version === "e2e")
  })

  it("トークンを再発行すると古いトークンの Worker は切断され、再接続できない", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const c = startWorker(token, engine.url)
    await until(() => c.connected)
    await h.db.workerCredential.update({ where: { workerId: worker.id }, data: { secretHash: "sha256:rotated" } })
    await h.redis.publish("voiloid:invalidate", JSON.stringify({ kind: "worker", workerId: worker.publicId }))
    await until(() => !c.connected)
    await new Promise((r) => setTimeout(r, 1_500))
    expect(c.connected).toBe(false)
  })

  it.skipIf(!process.env.VOICEVOX_E2E_URL)("実際の VOICEVOX で合成できる", async () => {
    const guild = await createTestGuild(h.db)
    const { token } = await registerTestWorker(h.db)
    const c = startWorker(token, process.env.VOICEVOX_E2E_URL!)
    await until(() => c.connected, 10_000)
    const res = await internal(h, "POST", "/synthesize", {
      guildId: guild.discordGuildId,
      userId: null,
      text: "読み上げのテストです",
    })
    expect(res.status).toBe(200)
    const audio = Buffer.from(await res.arrayBuffer())
    expect(audio.toString("ascii", 0, 4)).toBe("RIFF")
    expect(audio.length).toBeGreaterThan(10_000)
  })
})
