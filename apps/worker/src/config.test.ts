import { describe, expect, it } from "vitest"

import { engineUrl, loadConfig } from "./config"

const token = `wkr_${"A".repeat(20)}.${"s".repeat(43)}`
const base = {
  CONTROL_SERVER: "wss://console.example.com/worker",
  WORKER_TOKEN: token,
  WORKER_ENGINES: "VOICEVOX, AivisSpeech",
}

describe("loadConfig", () => {
  it("エンジンをカンマ区切りで指定する", () => {
    const config = loadConfig(base)
    expect(config.WORKER_ENGINES).toEqual(["VOICEVOX", "AivisSpeech"])
    expect(engineUrl(config, "VOICEVOX")).toBe("http://127.0.0.1:50021")
    expect(engineUrl(config, "AivisSpeech")).toBe("http://127.0.0.1:10101")
    expect(engineUrl(config, "COEIROINK")).toBe("http://127.0.0.1:50032")
  })

  it.each([
    ["未知のエンジン", { WORKER_ENGINES: "VOICEVOX,Unknown" }],
    ["エンジンなし", { WORKER_ENGINES: " , " }],
    ["不正なトークン", { WORKER_TOKEN: "abc" }],
    ["http の URL", { CONTROL_SERVER: "http://example.com" }],
  ])("%s は失敗する", (_label, patch) => {
    expect(() => loadConfig({ ...base, ...patch })).toThrow()
  })

  it("ws:// はローカル開発で明示した場合だけ許可する（トークンを平文で送らない）", () => {
    expect(() => loadConfig({ ...base, CONTROL_SERVER: "ws://127.0.0.1:4100/worker" })).toThrow(/wss/)
    expect(
      loadConfig({ ...base, CONTROL_SERVER: "ws://127.0.0.1:4100/worker", ALLOW_INSECURE: "true" }).ALLOW_INSECURE,
    ).toBe(true)
  })
})
