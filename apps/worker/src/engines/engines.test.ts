import { afterEach, describe, expect, it } from "vitest"

import { startFakeEngine, type FakeEngine } from "../../test/fake-engine"
import { createAdapter } from "./index"

let engine: FakeEngine | undefined
afterEach(() => engine?.close())

const params = { speakerId: "zunda-uuid", styleId: "3", text: "こんにちは", speed: 1.2, pitch: 0.05, intonation: 0.8 }

describe("VOICEVOX 互換アダプタ", () => {
  it("話者一覧: 読み上げ用のスタイルだけを、話者 UUID で返す", async () => {
    engine = await startFakeEngine("voicevox")
    const report = await createAdapter("VOICEVOX", `${engine.url}/`).report()
    expect(report).toEqual({
      engine: "VOICEVOX",
      version: "0.25.2",
      healthy: true,
      speakers: [
        { id: "zunda-uuid", name: "ずんだもん", styles: [{ id: "3", name: "ノーマル" }] },
        { id: "legacy", name: "古い話者", styles: [{ id: "1", name: "ノーマル" }] },
      ],
    })
  })

  it("合成: audio_query の話速・音高・抑揚を書き換えて synthesis に渡す", async () => {
    engine = await startFakeEngine("voicevox")
    const audio = await createAdapter("AivisSpeech", engine.url).synthesize(params, AbortSignal.timeout(5000))
    expect(audio.toString()).toBe("wav:3")
    expect(engine.requests.map((r) => r.path)).toEqual([
      `/audio_query?text=${encodeURIComponent("こんにちは")}&speaker=3`,
      "/synthesis?speaker=3",
    ])
    expect(engine.requests[1]?.body).toMatchObject({ speedScale: 1.2, pitchScale: 0.05, intonationScale: 0.8 })
  })

  it("エンジンのエラーは EngineError", async () => {
    engine = await startFakeEngine("voicevox")
    engine.failNext = 500
    await expect(createAdapter("VOICEVOX", engine.url).synthesize(params, AbortSignal.timeout(5000))).rejects.toThrow(
      /\[VOICEVOX\] audio_query failed: 500 engine error/,
    )
    engine.failNext = 503
    await expect(createAdapter("VOICEVOX", engine.url).report()).rejects.toThrow(/speakers failed/)
  })

  it("中断された合成は失敗する", async () => {
    engine = await startFakeEngine("voicevox")
    engine.delayMs = 500
    await expect(createAdapter("VOICEVOX", engine.url).synthesize(params, AbortSignal.timeout(50))).rejects.toThrow()
  })
})

describe("COEIROINK アダプタ", () => {
  it("話者一覧と合成", async () => {
    engine = await startFakeEngine("coeiroink")
    const adapter = createAdapter("COEIROINK", engine.url)
    expect(await adapter.report()).toEqual({
      engine: "COEIROINK",
      version: "2.3.4",
      healthy: true,
      speakers: [{ id: "tsukuyomi", name: "つくよみちゃん", styles: [{ id: "0", name: "れいせい" }] }],
    })
    const audio = await adapter.synthesize(
      { ...params, speakerId: "tsukuyomi", styleId: "0" },
      AbortSignal.timeout(5000),
    )
    expect(audio.toString()).toBe("wav:coeiroink")
    expect(engine.requests.at(-1)?.body).toMatchObject({ speakerUuid: "tsukuyomi", styleId: 0, speedScale: 1.2 })
  })
})
