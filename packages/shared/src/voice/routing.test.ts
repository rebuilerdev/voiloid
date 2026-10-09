import { describe, expect, it } from "vitest"

import type { VoiceSettings } from "../contracts"
import {
  availableEngines,
  personalWorkers,
  resolveVoice,
  serverWorkerTiers,
  tiersForEngine,
  workerTiersFor,
  type RoutingSettings,
  type RoutingWorker,
} from "./routing"

const official1: RoutingWorker = { id: "o1", type: "official", ownerUserId: null, scope: null, engines: ["VOICEVOX"] }
const official2: RoutingWorker = {
  id: "o2",
  type: "official",
  ownerUserId: null,
  scope: null,
  engines: ["VOICEVOX", "AivisSpeech"],
}
const shared: RoutingWorker = {
  id: "s1",
  type: "private",
  ownerUserId: "alice",
  scope: "server",
  engines: ["COEIROINK"],
}
const alicePersonal: RoutingWorker = {
  id: "p1",
  type: "private",
  ownerUserId: "alice",
  scope: "personal",
  engines: ["AivisSpeech", "COEIROINK"],
}
const bobPersonal: RoutingWorker = {
  id: "p2",
  type: "private",
  ownerUserId: "bob",
  scope: "personal",
  engines: ["COEIROINK"],
}
const unconnected: RoutingWorker = {
  id: "u1",
  type: "private",
  ownerUserId: "alice",
  scope: null,
  engines: ["VOICEVOX"],
}

const all = [official1, official2, shared, alicePersonal, bobPersonal, unconnected]

const settings = (patch: Partial<RoutingSettings> = {}): RoutingSettings => ({
  workerMode: "auto",
  specificWorkerId: null,
  fallbackToOfficial: true,
  ...patch,
})

const ids = (tiers: RoutingWorker[][]) => tiers.map((t) => t.map((w) => w.id))

const voice = (engine: VoiceSettings["engine"]): VoiceSettings => ({
  engine,
  speakerId: "speaker",
  styleId: "1",
  speed: 1,
  pitch: 0,
  intonation: 1,
})

describe("serverWorkerTiers", () => {
  it("auto: サーバーに共有された自鯖Worker と公式Worker を 1 つのグループにする", () => {
    expect(ids(serverWorkerTiers(settings(), all))).toEqual([["s1", "o1", "o2"]])
  })

  it("official: 公式Worker のみ", () => {
    expect(ids(serverWorkerTiers(settings({ workerMode: "official" }), all))).toEqual([["o1", "o2"]])
  })

  it("private_preferred: 自鯖Worker → 公式Worker の順（フォールバック有効）", () => {
    expect(ids(serverWorkerTiers(settings({ workerMode: "private_preferred" }), all))).toEqual([["s1"], ["o1", "o2"]])
  })

  it("private_preferred: フォールバック無効なら自鯖Worker のみ", () => {
    const tiers = serverWorkerTiers(settings({ workerMode: "private_preferred", fallbackToOfficial: false }), all)
    expect(ids(tiers)).toEqual([["s1"]])
  })

  it("specific: 指定した共有Worker のみ", () => {
    expect(ids(serverWorkerTiers(settings({ workerMode: "specific", specificWorkerId: "s1" }), all))).toEqual([["s1"]])
  })

  it("specific: 共有されていない Worker は指定できない", () => {
    expect(serverWorkerTiers(settings({ workerMode: "specific", specificWorkerId: "p1" }), all)).toEqual([])
    expect(serverWorkerTiers(settings({ workerMode: "specific", specificWorkerId: null }), all)).toEqual([])
  })

  it("空のグループは含めない", () => {
    expect(serverWorkerTiers(settings({ workerMode: "private_preferred" }), [official1])).toEqual([[official1]])
    expect(serverWorkerTiers(settings(), [])).toEqual([])
  })
})

describe("personalWorkers / workerTiersFor", () => {
  it("自分専用の Worker は本人だけが使える", () => {
    expect(personalWorkers(all, "alice").map((w) => w.id)).toEqual(["p1"])
    expect(personalWorkers(all, "carol")).toEqual([])
  })

  it("本人の自分専用 Worker を最優先にする", () => {
    expect(ids(workerTiersFor(settings(), all, "alice"))).toEqual([["p1"], ["s1", "o1", "o2"]])
  })

  it("userId が null（システムメッセージ）ならサーバーの Worker のみ", () => {
    expect(ids(workerTiersFor(settings(), all, null))).toEqual([["s1", "o1", "o2"]])
  })

  it("自分専用の Worker が無いユーザーはサーバーの Worker のみ", () => {
    expect(ids(workerTiersFor(settings(), all, "carol"))).toEqual([["s1", "o1", "o2"]])
  })
})

describe("availableEngines / tiersForEngine", () => {
  it("エンジンを重複なく昇順で返す", () => {
    expect(availableEngines(workerTiersFor(settings({ workerMode: "official" }), all, null))).toEqual([
      "AivisSpeech",
      "VOICEVOX",
    ])
    expect(availableEngines(workerTiersFor(settings({ workerMode: "official" }), all, "alice"))).toEqual([
      "AivisSpeech",
      "COEIROINK",
      "VOICEVOX",
    ])
  })

  it("指定エンジンを持つ Worker だけに絞り、空のグループは除く", () => {
    const tiers = workerTiersFor(settings(), all, "alice")
    expect(ids(tiersForEngine(tiers, "COEIROINK"))).toEqual([["p1"], ["s1"]])
    expect(ids(tiersForEngine(tiers, "VOICEVOX"))).toEqual([["o1", "o2"]])
    expect(tiersForEngine(tiers, "unknown")).toEqual([])
  })
})

describe("resolveVoice", () => {
  const base = { settings: settings(), workers: all }

  it("マイボイスのエンジンが使えるならマイボイス", () => {
    const result = resolveVoice({
      ...base,
      userId: "alice",
      userVoice: voice("COEIROINK"),
      guildVoice: voice("VOICEVOX"),
    })
    expect(result?.source).toBe("user")
    expect(result?.voice.engine).toBe("COEIROINK")
    expect(ids(result!.tiers)).toEqual([["p1"], ["s1"]])
  })

  it("マイボイスのエンジンが使えないならサーバーのデフォルト音声", () => {
    const result = resolveVoice({
      ...base,
      settings: settings({ workerMode: "official" }),
      userId: "carol",
      userVoice: voice("COEIROINK"),
      guildVoice: voice("VOICEVOX"),
    })
    expect(result?.source).toBe("guild")
    expect(result?.voice.engine).toBe("VOICEVOX")
  })

  it("マイボイス未設定ならサーバーのデフォルト音声", () => {
    const result = resolveVoice({ ...base, userId: "alice", userVoice: null, guildVoice: voice("AivisSpeech") })
    expect(result?.source).toBe("guild")
    expect(ids(result!.tiers)).toEqual([["p1"], ["o2"]])
  })

  it("他人の自分専用 Worker にしか無いエンジンは使えない", () => {
    const result = resolveVoice({
      ...base,
      settings: settings({ workerMode: "official" }),
      userId: "carol",
      userVoice: null,
      guildVoice: voice("COEIROINK"),
    })
    expect(result).toBeNull()
  })

  it("どの声も合成できる Worker が無ければ null", () => {
    expect(
      resolveVoice({
        ...base,
        workers: [],
        userId: "alice",
        userVoice: voice("VOICEVOX"),
        guildVoice: voice("VOICEVOX"),
      }),
    ).toBeNull()
  })
})
