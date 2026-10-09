import { describe, expect, it } from "vitest"

import { BOT_AVATAR } from "../constants"
import {
  base64Bytes,
  createOperatorRequestSchema,
  createWorkerRequestSchema,
  dictionaryEntryInputSchema,
  reasonRequestSchema,
  updateAdminWorkerRequestSchema,
  updateGuildBotProfileRequestSchema,
  updateGuildSettingsRequestSchema,
  updateMeRequestSchema,
  updateSystemSettingsRequestSchema,
  updateWorkerGuildsRequestSchema,
  voicePreviewRequestSchema,
  voiceSettingsSchema,
} from "./index"

const voice = { engine: "VOICEVOX", speakerId: "s", styleId: "3", speed: 1, pitch: 0, intonation: 1 }

describe("voiceSettingsSchema", () => {
  it("正しい値を受け付ける", () => {
    expect(voiceSettingsSchema.parse(voice)).toEqual(voice)
  })

  it.each([
    ["未知のエンジン", { ...voice, engine: "unknown" }],
    ["話速の範囲外", { ...voice, speed: 2.5 }],
    ["音高の範囲外", { ...voice, pitch: -1 }],
    ["抑揚の範囲外", { ...voice, intonation: 3 }],
    ["NaN", { ...voice, speed: Number.NaN }],
    ["余分な項目", { ...voice, extra: true }],
    ["空の話者", { ...voice, speakerId: "" }],
  ])("%s は拒否する", (_label, value) => {
    expect(voiceSettingsSchema.safeParse(value).success).toBe(false)
  })
})

describe("updateMeRequestSchema", () => {
  it("null（各サーバーのデフォルト音声）を受け付ける", () => {
    expect(updateMeRequestSchema.parse({ voice: null })).toEqual({ voice: null })
  })

  it("voice の省略は拒否する", () => {
    expect(updateMeRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe("updateGuildSettingsRequestSchema", () => {
  it("部分更新を受け付け、チャンネルは null で解除できる", () => {
    const parsed = updateGuildSettingsRequestSchema.parse({ readUrls: true, textChannelId: null })
    expect(parsed).toEqual({ readUrls: true, textChannelId: null })
  })

  it.each([
    ["最大文字数 0", { maxCharacters: 0 }],
    ["最大文字数 1001", { maxCharacters: 1001 }],
    ["小数", { maxCharacters: 1.5 }],
    ["voice を null", { voice: null }],
    ["不正なチャンネル ID", { textChannelId: "abc" }],
    ["未知の項目", { unknown: 1 }],
    ["未知のモード", { workerMode: "random" }],
  ])("%s は拒否する", (_label, value) => {
    expect(updateGuildSettingsRequestSchema.safeParse(value).success).toBe(false)
  })
})

describe("updateGuildBotProfileRequestSchema", () => {
  const png = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes).toString("base64")}`

  it("ニックネームは前後の空白を除き、null で既定に戻せる", () => {
    expect(updateGuildBotProfileRequestSchema.parse({ nickname: "  ずんだ  " })).toEqual({ nickname: "ずんだ" })
    expect(updateGuildBotProfileRequestSchema.parse({ nickname: null, avatar: null })).toEqual({
      nickname: null,
      avatar: null,
    })
  })

  it("33 文字のニックネームは拒否する", () => {
    expect(updateGuildBotProfileRequestSchema.safeParse({ nickname: "あ".repeat(33) }).success).toBe(false)
  })

  it("上限ちょうどの画像は受け付け、超えたら拒否する", () => {
    expect(updateGuildBotProfileRequestSchema.safeParse({ avatar: png(BOT_AVATAR.maxBytes) }).success).toBe(true)
    expect(updateGuildBotProfileRequestSchema.safeParse({ avatar: png(BOT_AVATAR.maxBytes + 1) }).success).toBe(false)
  })

  it("画像以外の data URL は拒否する", () => {
    expect(updateGuildBotProfileRequestSchema.safeParse({ avatar: "data:text/plain;base64,aGVsbG8=" }).success).toBe(
      false,
    )
  })
})

describe("base64Bytes", () => {
  it.each([
    ["", 0],
    ["YQ==", 1],
    ["YWI=", 2],
    ["YWJj", 3],
  ])("%s は %d バイト", (value, bytes) => {
    expect(base64Bytes(value)).toBe(bytes)
  })
})

describe("dictionaryEntryInputSchema", () => {
  it("前後の空白を除く", () => {
    expect(dictionaryEntryInputSchema.parse({ word: " w ", reading: " わら " })).toEqual({ word: "w", reading: "わら" })
  })

  it("空白だけの語は拒否する", () => {
    expect(dictionaryEntryInputSchema.safeParse({ word: "  ", reading: "x" }).success).toBe(false)
  })
})

describe("createWorkerRequestSchema", () => {
  it("名前とエンジンを受け付ける", () => {
    expect(createWorkerRequestSchema.parse({ name: " home ", engines: ["VOICEVOX"] })).toEqual({
      name: "home",
      engines: ["VOICEVOX"],
    })
  })

  it.each([
    ["エンジンなし", { name: "a", engines: [] }],
    ["重複したエンジン", { name: "a", engines: ["VOICEVOX", "VOICEVOX"] }],
    ["65 文字の名前", { name: "a".repeat(65), engines: ["VOICEVOX"] }],
  ])("%s は拒否する", (_label, value) => {
    expect(createWorkerRequestSchema.safeParse(value).success).toBe(false)
  })
})

describe("updateWorkerGuildsRequestSchema", () => {
  const guildId = "123456789012345678"

  it("server / personal を受け付ける", () => {
    expect(
      updateWorkerGuildsRequestSchema.parse({ connections: [{ guildId, scope: "personal" }] }).connections,
    ).toHaveLength(1)
  })

  it("同じサーバーの重複と none は拒否する", () => {
    expect(
      updateWorkerGuildsRequestSchema.safeParse({
        connections: [
          { guildId, scope: "server" },
          { guildId, scope: "personal" },
        ],
      }).success,
    ).toBe(false)
    expect(updateWorkerGuildsRequestSchema.safeParse({ connections: [{ guildId, scope: "none" }] }).success).toBe(false)
  })
})

describe("voicePreviewRequestSchema", () => {
  it("テキストの前後の空白を除き、空なら拒否する", () => {
    expect(voicePreviewRequestSchema.parse({ ...voice, text: " こんにちは " }).text).toBe("こんにちは")
    expect(voicePreviewRequestSchema.safeParse({ ...voice, text: " " }).success).toBe(false)
  })
})

describe("運営コンソール", () => {
  it("理由は前後の空白を除いて 1〜500 文字", () => {
    expect(reasonRequestSchema.parse({ reason: "  spam " })).toEqual({ reason: "spam" })
    expect(reasonRequestSchema.safeParse({ reason: "   " }).success).toBe(false)
    expect(reasonRequestSchema.safeParse({ reason: "a".repeat(501) }).success).toBe(false)
  })

  it("Worker の変更は名前か有効 / 無効のどちらかが必要", () => {
    expect(updateAdminWorkerRequestSchema.safeParse({ enabled: false }).success).toBe(true)
    expect(updateAdminWorkerRequestSchema.safeParse({ name: "pc" }).success).toBe(true)
    expect(updateAdminWorkerRequestSchema.safeParse({}).success).toBe(false)
  })

  it("サービス全体の設定は部分更新・お知らせの削除ができ、範囲外の上限は拒否する", () => {
    expect(updateSystemSettingsRequestSchema.safeParse({ announcement: null }).success).toBe(true)
    expect(updateSystemSettingsRequestSchema.safeParse({ limits: { maxWorkersPerUser: 0 } }).success).toBe(true)
    expect(updateSystemSettingsRequestSchema.safeParse({ limits: { maxWorkersPerUser: 1001 } }).success).toBe(false)
    expect(
      updateSystemSettingsRequestSchema.safeParse({ announcement: { message: "x", level: "error" } }).success,
    ).toBe(false)
    expect(updateSystemSettingsRequestSchema.safeParse({ unknown: 1 }).success).toBe(false)
  })

  it("Web から owner の運営者は追加できない", () => {
    const discordUserId = "400000000000000001"
    expect(createOperatorRequestSchema.safeParse({ discordUserId, role: "admin" }).success).toBe(true)
    expect(createOperatorRequestSchema.safeParse({ discordUserId, role: "owner" }).success).toBe(false)
  })
})
