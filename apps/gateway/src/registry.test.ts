import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import type { WebSocket } from "ws"

import { WorkerRegistry, type ConnectedWorker } from "./registry"

const redis = { set: vi.fn(() => Promise.resolve("OK")), del: vi.fn(() => Promise.resolve(1)) } as unknown as Redis

function worker(patch: Partial<ConnectedWorker> = {}): ConnectedWorker {
  return {
    id: "w1",
    publicId: "pub",
    name: "w",
    type: "official",
    ownerUserId: null,
    socket: { send: vi.fn((_data: string, cb: (error?: Error) => void) => cb()) } as unknown as WebSocket,
    engines: new Map([
      [
        "VOICEVOX",
        { engine: "VOICEVOX", healthy: true, speakers: [{ id: "s", name: "n", styles: [{ id: "1", name: "x" }] }] },
      ],
      ["AivisSpeech", { engine: "AivisSpeech", healthy: false, speakers: [] }],
    ]),
    maxConcurrency: 2,
    version: "1",
    pending: new Map(),
    failures: 0,
    latencyMs: 12,
    lastSeenAt: new Date("2026-10-09T00:00:00Z"),
    ...patch,
  }
}

describe("WorkerRegistry", () => {
  it("話者・スタイル・エンジンの状態で合成できるか判定する", () => {
    const w = worker()
    expect(WorkerRegistry.supports(w, { engine: "VOICEVOX", speakerId: "s", styleId: "1" })).toBe(true)
    expect(WorkerRegistry.supports(w, { engine: "VOICEVOX", speakerId: "s", styleId: "2" })).toBe(false)
    expect(WorkerRegistry.supports(w, { engine: "AivisSpeech", speakerId: "s", styleId: "1" })).toBe(false)
    expect(WorkerRegistry.supports(w, { engine: "COEIROINK", speakerId: "s", styleId: "1" })).toBe(false)
    expect(WorkerRegistry.healthyEngines(w)).toEqual(["VOICEVOX"])
  })

  it("リアルタイム状態: 同時実行数を超えたら busy、異常なエンジンがあれば degraded", () => {
    const registry = new WorkerRegistry(redis, 1000)
    const w = worker()
    registry.add(w)
    expect(registry.liveState(w)).toMatchObject({ status: "degraded", runningJobs: 0, queue: 0, latencyMs: 12 })
    for (let i = 0; i < 3; i++)
      w.pending.set(String(i), { resolve: vi.fn(), reject: vi.fn(), timer: setTimeout(() => undefined, 0) })
    expect(registry.liveState(w)).toMatchObject({ status: "busy", runningJobs: 2, queue: 1 })
    expect(WorkerRegistry.load(w)).toBe(1.5)
    w.engines.delete("AivisSpeech")
    w.pending.clear()
    expect(registry.liveState(w).status).toBe("online")
  })

  it("送信に失敗したジョブは失敗にする", async () => {
    const registry = new WorkerRegistry(redis, 1000)
    const w = worker({
      socket: { send: vi.fn((_d: string, cb: (e?: Error) => void) => cb(new Error("closed"))) } as unknown as WebSocket,
    })
    registry.add(w)
    await expect(
      registry.dispatch(w, {
        engine: "VOICEVOX",
        speakerId: "s",
        styleId: "1",
        text: "a",
        speed: 1,
        pitch: 0,
        intonation: 1,
      }),
    ).rejects.toThrow("failed to send")
    expect(w.pending.size).toBe(0)
  })

  it("未知のジョブの結果は無視し、置き換え済みの接続は解除しない", () => {
    const registry = new WorkerRegistry(redis, 1000)
    const old = worker()
    const next = worker()
    registry.add(old)
    expect(registry.add(next)).toBe(old)
    expect(registry.remove(old)).toBe(false)
    registry.complete(next, { jobId: "unknown", ok: true, audio: "" })
    expect(registry.findByPublicId("pub")).toBe(next)
    expect(registry.list()).toEqual([next])
  })
})
