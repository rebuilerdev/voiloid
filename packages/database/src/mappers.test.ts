import { describe, expect, it } from "vitest"

import { WorkerGuildScope, WorkerType } from "./generated/prisma/client"
import {
  guildVoice,
  guildVoiceColumns,
  longMessageFromDb,
  longMessageToDb,
  readingModeFromDb,
  readingModeToDb,
  routingWorker,
  scopeFromDb,
  voiceFromColumns,
  voiceToColumns,
  workerModeFromDb,
  workerModeToDb,
  workerStatusFromDb,
  workerTypeFromDb,
} from "./mappers"

const voice = { engine: "AivisSpeech" as const, speakerId: "s", styleId: "1", speed: 1.1, pitch: 0.01, intonation: 0.9 }

describe("Enum の変換", () => {
  it("API の値と DB の値を相互に変換できる", () => {
    for (const mode of ["auto", "official", "private_preferred", "specific"] as const) {
      expect(workerModeFromDb[workerModeToDb[mode]]).toBe(mode)
    }
    expect(readingModeFromDb[readingModeToDb.fixed]).toBe("fixed")
    expect(longMessageFromDb[longMessageToDb.skip]).toBe("skip")
    expect(scopeFromDb[WorkerGuildScope.PERSONAL]).toBe("personal")
  })

  it("Worker の状態は API の 4 種類にまとめる", () => {
    expect(workerStatusFromDb).toEqual({
      ONLINE: "online",
      BUSY: "busy",
      DEGRADED: "error",
      ERROR: "error",
      OFFLINE: "offline",
      DISABLED: "offline",
    })
    expect(workerTypeFromDb(WorkerType.OFFICIAL)).toBe("official")
    expect(workerTypeFromDb(WorkerType.PRIVATE)).toBe("private")
  })
})

describe("音声設定の変換", () => {
  it("列との相互変換", () => {
    expect(voiceFromColumns(voiceToColumns(voice))).toEqual(voice)
  })

  it("サーバーのデフォルト音声", () => {
    const columns = guildVoiceColumns(voice)
    expect(columns).toEqual({
      voiceEngineId: "AivisSpeech",
      voiceSpeakerId: "s",
      voiceStyleId: "1",
      voiceSpeed: 1.1,
      voicePitch: 0.01,
      voiceIntonation: 0.9,
    })
    expect(guildVoice(columns as Parameters<typeof guildVoice>[0])).toEqual(voice)
  })

  it("未知のエンジンは null", () => {
    expect(voiceFromColumns({ ...voiceToColumns(voice), engineId: "Removed" })).toBeNull()
  })
})

describe("routingWorker", () => {
  it("対象サーバーの接続が無ければ scope は null", () => {
    expect(
      routingWorker({
        id: "w",
        type: WorkerType.PRIVATE,
        ownerUserId: "u",
        engines: [{ engineId: "VOICEVOX" }],
        guildPermissions: [],
      }),
    ).toEqual({ id: "w", type: "private", ownerUserId: "u", scope: null, engines: ["VOICEVOX"] })
  })
})
