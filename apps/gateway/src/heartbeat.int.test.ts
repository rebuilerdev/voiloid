import { redisKeys, WORKER_PROTOCOL_VERSION } from "@voiloid/shared/protocol"
import WebSocket from "ws"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createGatewayHarness,
  engine,
  FakeWorker,
  registerTestWorker,
  until,
  type GatewayHarness,
} from "../test/harness"

const harness = createGatewayHarness({ heartbeatIntervalMs: 100 })
let h: GatewayHarness

beforeEach(async () => {
  h = await harness.setup()
})
afterEach(() => harness.cleanup())
afterAll(() => harness.teardown())

describe("ハートビート", () => {
  it("ping に応答する Worker のレイテンシを計測する", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const w = new FakeWorker(h.workerUrl, token, [engine("VOICEVOX", [["s", ["1"]]])])
    harness.workers.push(w)
    await w.connect()
    await until(async () => {
      const raw = await h.redis.get(redisKeys.workerLive(worker.id))
      return raw !== null && (JSON.parse(raw) as { latencyMs?: number }).latencyMs !== undefined
    })
  })

  it("ping に応答しない Worker を切断する", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const socket = new WebSocket(h.workerUrl, { headers: { Authorization: `Bearer ${token}` }, autoPong: false })
    await new Promise((resolve) => socket.once("open", resolve))
    socket.send(
      JSON.stringify({
        type: "hello",
        protocolVersion: WORKER_PROTOCOL_VERSION,
        workerVersion: "1",
        maxConcurrency: 1,
        engines: [],
      }),
    )
    const code = await new Promise<number>((resolve) => socket.once("close", (c) => resolve(c)))
    expect(code).toBe(1006)
    await until(async () => (await h.db.worker.findUniqueOrThrow({ where: { id: worker.id } })).status === "OFFLINE")
  })
})
