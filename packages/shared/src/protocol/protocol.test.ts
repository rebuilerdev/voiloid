import { describe, expect, it } from "vitest"

import { AppError, conflict, forbidden, isAppError, notFound, validationError } from "../errors"
import { ENGINE_IDS, isEngineId } from "../engines"
import {
  formatWorkerToken,
  gatewayMessageSchema,
  internalSynthesizeRequestSchema,
  parseWorkerToken,
  redisKeys,
  workerMessageSchema,
} from "./index"

const jobId = "3f0b8f6e-6d0a-4b6e-9a51-2a3c1b0e9f11"

describe("parseWorkerToken / formatWorkerToken", () => {
  const publicId = "A1b2C3d4E5f6G7h8"
  const secret = "s".repeat(43)

  it("形式どおりのトークンを分解できる", () => {
    expect(parseWorkerToken(formatWorkerToken(publicId, secret))).toEqual({ publicId, secret })
  })

  it.each(["", "wkr_short.secret", `wkr_${publicId}`, `xxx_${publicId}.${secret}`, `wkr_${publicId}.${secret}!`])(
    "不正な形式 %s は null",
    (token) => {
      expect(parseWorkerToken(token)).toBeNull()
    },
  )
})

describe("workerMessageSchema", () => {
  it("hello を受け付ける", () => {
    const hello = {
      type: "hello",
      protocolVersion: 1,
      workerVersion: "1.0.0",
      maxConcurrency: 2,
      engines: [
        {
          engine: "VOICEVOX",
          healthy: true,
          speakers: [{ id: "uuid", name: "ずんだもん", styles: [{ id: "3", name: "ノーマル" }] }],
        },
      ],
    }
    expect(workerMessageSchema.parse(hello)).toEqual(hello)
  })

  it("成功・失敗の result を受け付ける", () => {
    expect(workerMessageSchema.parse({ type: "result", jobId, ok: true, audio: "UklGRg==" })).toMatchObject({
      ok: true,
    })
    expect(workerMessageSchema.parse({ type: "result", jobId, ok: false, error: "boom" })).toMatchObject({ ok: false })
  })

  it.each([
    ["未知の type", { type: "unknown" }],
    ["未知のエンジン", { type: "engines", engines: [{ engine: "x", healthy: true, speakers: [] }] }],
    ["jobId が UUID でない", { type: "result", jobId: "1", ok: true, audio: "a" }],
    ["同時実行数 0", { type: "hello", protocolVersion: 1, workerVersion: "1", maxConcurrency: 0, engines: [] }],
  ])("%s は拒否する", (_label, value) => {
    expect(workerMessageSchema.safeParse(value).success).toBe(false)
  })
})

describe("gatewayMessageSchema", () => {
  it("synthesize / welcome / refresh を受け付ける", () => {
    expect(
      gatewayMessageSchema.parse({
        type: "synthesize",
        jobId,
        engine: "AivisSpeech",
        speakerId: "a",
        styleId: "1",
        text: "こんにちは",
        speed: 1,
        pitch: 0,
        intonation: 1,
      }).type,
    ).toBe("synthesize")
    expect(gatewayMessageSchema.parse({ type: "welcome", workerId: "w", name: "n", heartbeatIntervalMs: 1 }).type).toBe(
      "welcome",
    )
    expect(gatewayMessageSchema.parse({ type: "refresh" }).type).toBe("refresh")
  })
})

describe("internalSynthesizeRequestSchema", () => {
  it("システムメッセージは userId を null にできる", () => {
    expect(
      internalSynthesizeRequestSchema.parse({ guildId: "123456789012345678", userId: null, text: "接続しました" }),
    ).toMatchObject({ userId: null })
  })
})

describe("redisKeys", () => {
  it("キーにプレフィックスが付く", () => {
    const keys = Object.values(redisKeys).map((key: (id: string) => string) => key("x"))
    expect(keys.every((k) => k.startsWith("voiloid:"))).toBe(true)
  })
})

describe("errors", () => {
  it("コードに対応する HTTP ステータスを持つ", () => {
    expect(notFound("Guild")).toMatchObject({ code: "NOT_FOUND", status: 404, message: "Guild not found." })
    expect(notFound().message).toBe("Resource not found.")
    expect(forbidden()).toMatchObject({ status: 403 })
    expect(forbidden("x").message).toBe("x")
    expect(conflict()).toMatchObject({ status: 409 })
    expect(conflict("dup").message).toBe("dup")
    expect(validationError("bad", { field: "a" })).toMatchObject({ status: 400, details: { field: "a" } })
    expect(new AppError("RATE_LIMITED", "slow").status).toBe(429)
  })

  it("isAppError は AppError だけを判定する", () => {
    expect(isAppError(notFound())).toBe(true)
    expect(isAppError(new Error("x"))).toBe(false)
  })
})

describe("engines", () => {
  it("定義済みのエンジン ID を判定する", () => {
    expect(ENGINE_IDS).toEqual(["VOICEVOX", "AivisSpeech", "COEIROINK"])
    expect(isEngineId("VOICEVOX")).toBe(true)
    expect(isEngineId("toString")).toBe(false)
  })
})
