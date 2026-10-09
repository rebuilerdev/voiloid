/**
 * PostgreSQL の制約（Unique / Foreign Key / CHECK / Cascade / SetNull）と、Prisma エラーの変換。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  createTestGuild,
  createTestUser,
  createTestWorker,
  resetTestDatabase,
  snowflake,
} from "../test/helpers"
import { mapPrismaError } from "./errors"
import { WorkerGuildScope, WorkerMode, WorkerType } from "./generated/prisma/client"

const db = createTestDatabase()

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

/** 失敗した Prisma 操作をアプリケーションエラーに変換して返す */
async function errorOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return mapPrismaError(error)
  }
  throw new Error("expected the operation to fail")
}

describe("Unique 制約", () => {
  it("discordUserId の重複は CONFLICT", async () => {
    const user = await createTestUser(db)
    const error = await errorOf(createTestUser(db, { discordUserId: user.discordUserId }))
    expect(error).toMatchObject({ code: "CONFLICT", status: 409 })
  })

  it("discordGuildId の重複は CONFLICT", async () => {
    const guild = await createTestGuild(db)
    expect(await errorOf(createTestGuild(db, { discordGuildId: guild.discordGuildId }))).toMatchObject({
      code: "CONFLICT",
    })
  })

  it("同じサーバーで同じ単語（大文字小文字・全角半角の違いを含む）は登録できない", async () => {
    const guild = await createTestGuild(db)
    const entry = (word: string) =>
      db.dictionaryEntry.create({
        data: { guildId: guild.id, word, wordKey: word.normalize("NFKC").toLowerCase(), reading: "x" },
      })
    await entry("Discord")
    expect(await errorOf(entry("Discord"))).toMatchObject({ code: "CONFLICT" })
    expect(await errorOf(entry("ＤＩＳＣＯＲＤ"))).toMatchObject({ code: "CONFLICT" })
  })

  it("別のサーバーなら同じ単語を登録できる", async () => {
    const [a, b] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    for (const guild of [a, b]) {
      await db.dictionaryEntry.create({ data: { guildId: guild.id, word: "w", wordKey: "w", reading: "わら" } })
    }
    expect(await db.dictionaryEntry.count()).toBe(2)
  })

  it("同じ Worker とサーバーの ACL は重複できない", async () => {
    const guild = await createTestGuild(db)
    const worker = await createTestWorker(db)
    await db.workerGuildPermission.create({ data: { workerId: worker.id, guildId: guild.id } })
    const error = await errorOf(
      db.workerGuildPermission.create({ data: { workerId: worker.id, guildId: guild.id, scope: "PERSONAL" } }),
    )
    expect(error).toMatchObject({ code: "CONFLICT" })
  })
})

describe("CHECK 制約", () => {
  it.each([
    ["maxCharacters = 0", { maxCharacters: 0 }],
    ["maxCharacters = 1001", { maxCharacters: 1001 }],
    ["voiceSpeed = 3", { voiceSpeed: 3 }],
    ["voicePitch = 1", { voicePitch: 1 }],
    ["autoLeaveDelaySeconds = -1", { autoLeaveDelaySeconds: -1 }],
    ["FIXED モードでチャンネル未設定", { readingMode: "FIXED" as const }],
  ])("%s は VALIDATION_ERROR", async (_label, data) => {
    const guild = await createTestGuild(db)
    expect(await errorOf(db.guildSettings.create({ data: { guildId: guild.id, ...data } }))).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    })
  })

  it("FIXED モードはチャンネルを指定すれば保存できる", async () => {
    const guild = await createTestGuild(db)
    const settings = await db.guildSettings.create({
      data: {
        guildId: guild.id,
        readingMode: "FIXED",
        defaultTextChannelId: snowflake(),
        defaultVoiceChannelId: snowflake(),
      },
    })
    expect(settings.readingMode).toBe("FIXED")
  })

  it("空白だけの単語・読みは保存できない", async () => {
    const guild = await createTestGuild(db)
    const error = await errorOf(
      db.dictionaryEntry.create({ data: { guildId: guild.id, word: "  ", wordKey: "  ", reading: "x" } }),
    )
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("公式Worker は所有者を持てない", async () => {
    const user = await createTestUser(db)
    const error = await errorOf(
      db.worker.create({
        data: { publicId: "official-owned", name: "x", type: WorkerType.OFFICIAL, ownerUserId: user.id },
      }),
    )
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("同時実行数は 1〜64", async () => {
    const error = await errorOf(
      db.worker.create({ data: { publicId: "p", name: "x", type: WorkerType.PRIVATE, maxConcurrency: 0 } }),
    )
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("文字数がマイナスの利用記録は保存できない", async () => {
    const guild = await createTestGuild(db)
    const error = await errorOf(
      db.usageEvent.create({ data: { guildId: guild.id, engineId: "VOICEVOX", characters: -1, success: true } }),
    )
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("列の長さを超える値は VALIDATION_ERROR", async () => {
    const error = await errorOf(createTestGuild(db, { name: "x".repeat(101) }))
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("Foreign Key / Not Found", () => {
  it("存在しないサーバーへの辞書登録は VALIDATION_ERROR", async () => {
    const error = await errorOf(
      db.dictionaryEntry.create({
        data: { guildId: "00000000-0000-7000-8000-000000000000", word: "a", wordKey: "a", reading: "a" },
      }),
    )
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("存在しないレコードの更新は NOT_FOUND", async () => {
    const error = await errorOf(
      db.worker.update({ where: { id: "00000000-0000-7000-8000-000000000000" }, data: { name: "x" } }),
    )
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 })
  })

  it("変換後のエラーに SQL や値を含めない", async () => {
    const user = await createTestUser(db)
    const error = await errorOf(createTestUser(db, { discordUserId: user.discordUserId }))
    expect(error.message).not.toContain(user.discordUserId)
    expect(error.message).not.toMatch(/insert|select|"User"/i)
  })
})

describe("Cascade / SetNull", () => {
  it("サーバーを削除すると、設定・辞書・ACL・利用記録・セッション・サーバーごとの声も削除され、監査ログは残る", async () => {
    const guild = await createTestGuild(db)
    const user = await createTestUser(db)
    const worker = await createTestWorker(db, { ownerUserId: user.id })
    await db.guildSettings.create({ data: { guildId: guild.id } })
    await db.guildBotProfile.create({ data: { guildId: guild.id, nickname: "x" } })
    await db.dictionaryEntry.create({ data: { guildId: guild.id, word: "a", wordKey: "a", reading: "a" } })
    await db.workerGuildPermission.create({ data: { workerId: worker.id, guildId: guild.id } })
    await db.usageEvent.create({ data: { guildId: guild.id, engineId: "VOICEVOX", characters: 1, success: true } })
    await db.voiceSession.create({
      data: { guildId: guild.id, botUserId: snowflake(), textChannelId: snowflake(), voiceChannelId: snowflake() },
    })
    await db.guildUserVoiceSettings.create({
      data: { guildId: guild.id, userId: user.id, engineId: "VOICEVOX", speakerId: "s", styleId: "1" },
    })
    const audit = await db.auditLog.create({ data: { guildId: guild.id, action: "x", targetType: "guild" } })

    await db.guild.delete({ where: { id: guild.id } })

    expect(await db.guildSettings.count()).toBe(0)
    expect(await db.guildBotProfile.count()).toBe(0)
    expect(await db.dictionaryEntry.count()).toBe(0)
    expect(await db.workerGuildPermission.count()).toBe(0)
    expect(await db.usageEvent.count()).toBe(0)
    expect(await db.voiceSession.count()).toBe(0)
    expect(await db.guildUserVoiceSettings.count()).toBe(0)
    expect(await db.auditLog.findUnique({ where: { id: audit.id } })).toMatchObject({ guildId: null })
    // Worker 自体は残る
    expect(await db.worker.count()).toBe(1)
  })

  it("Worker を物理削除すると Credential・Engine・ACL は削除され、利用記録とサーバー設定の参照は NULL になる", async () => {
    const guild = await createTestGuild(db)
    const worker = await createTestWorker(db, {
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.SERVER }],
    })
    await db.guildSettings.create({
      data: { guildId: guild.id, workerMode: WorkerMode.SPECIFIC, specificWorkerId: worker.id },
    })
    const usage = await db.usageEvent.create({
      data: { guildId: guild.id, workerId: worker.id, engineId: "VOICEVOX", characters: 3, success: true },
    })

    await db.worker.delete({ where: { id: worker.id } })

    expect(await db.workerCredential.count()).toBe(0)
    expect(await db.workerEngine.count()).toBe(0)
    expect(await db.workerGuildPermission.count()).toBe(0)
    expect(await db.usageEvent.findUnique({ where: { id: usage.id } })).toMatchObject({ workerId: null, characters: 3 })
    expect(await db.guildSettings.findUnique({ where: { guildId: guild.id } })).toMatchObject({
      specificWorkerId: null,
    })
  })

  it("ユーザーを削除すると声の設定は削除され、Worker の所有者・辞書の作成者・監査ログの実行者は NULL になる", async () => {
    const user = await createTestUser(db)
    const guild = await createTestGuild(db)
    const worker = await createTestWorker(db, { ownerUserId: user.id })
    await db.userVoiceSettings.create({ data: { userId: user.id, engineId: "VOICEVOX", speakerId: "s", styleId: "1" } })
    const entry = await db.dictionaryEntry.create({
      data: { guildId: guild.id, word: "a", wordKey: "a", reading: "a", createdByUserId: user.id },
    })
    const audit = await db.auditLog.create({ data: { actorUserId: user.id, action: "x", targetType: "user" } })

    await db.user.delete({ where: { id: user.id } })

    expect(await db.userVoiceSettings.count()).toBe(0)
    expect(await db.worker.findUnique({ where: { id: worker.id } })).toMatchObject({ ownerUserId: null })
    expect(await db.dictionaryEntry.findUnique({ where: { id: entry.id } })).toMatchObject({ createdByUserId: null })
    expect(await db.auditLog.findUnique({ where: { id: audit.id } })).toMatchObject({ actorUserId: null })
  })
})

describe("既定値", () => {
  it("サーバー設定の既定値は仕様どおり", async () => {
    const guild = await createTestGuild(db)
    const settings = await db.guildSettings.create({ data: { guildId: guild.id } })
    expect(settings).toMatchObject({
      readingMode: "COMMAND",
      autoJoin: false,
      readUrlsMode: "OMIT",
      maxCharacters: 200,
      longMessageBehavior: "TRUNCATE",
      autoLeaveDelaySeconds: 30,
      workerMode: "AUTOMATIC",
      fallbackToOfficial: true,
      voiceEngineId: "VOICEVOX",
      voiceStyleId: "3",
    })
  })

  it("ID は UUID（v7）", async () => {
    const user = await createTestUser(db)
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
