/**
 * 運営操作のための DB 機能: サービス全体の設定・運営者・利用停止・ユーザーデータの削除・Worker の無効化。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  createTestGuild,
  createTestUser,
  createTestWorker,
  resetTestDatabase,
} from "../../test/helpers"
import { mapPrismaError } from "../errors"
import { WorkerGuildScope, WorkerType } from "../generated/prisma/client"
import { deleteUserData } from "../transactions/user.transactions"
import { createRepositories } from "./index"

const db = createTestDatabase()
const repos = createRepositories(db)

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

describe("systemSettingsRepository", () => {
  it("1 行だけを既定値で作り、部分更新する", async () => {
    expect(await repos.system.get()).toMatchObject({
      id: 1,
      maxWorkersPerUser: 10,
      dictionaryMaxEntries: 1000,
      readingPaused: false,
    })
    const updated = await repos.system.update({ readingPaused: true, announcementMessage: "メンテナンス中" })
    expect(updated).toMatchObject({ readingPaused: true, announcementMessage: "メンテナンス中", maxWorkersPerUser: 10 })
    expect(await db.systemSettings.count()).toBe(1)
  })

  it.each([
    ["2 行目", () => db.systemSettings.create({ data: { id: 2 } })],
    [
      "上限を超える初期の最大文字数",
      () => repos.system.update({ maxCharactersLimit: 100, newGuildMaxCharacters: 200 }),
    ],
    ["範囲外の話速", () => repos.system.update({ newGuildVoiceSpeed: 9 })],
    ["マイナスの Worker 上限", () => repos.system.update({ maxWorkersPerUser: -1 })],
  ])("%s は保存できない", async (_label, operation) => {
    await repos.system.get()
    expect((await operation().catch(mapPrismaError)) as { code?: string }).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("新しいサーバーの設定は「新しいサーバーの初期値」で作る（既存のサーバーは変えない）", async () => {
    const existing = await createTestGuild(db)
    await repos.guildSettings.getOrCreate(existing.id)
    await repos.system.update({
      newGuildMaxCharacters: 80,
      newGuildVoiceEngineId: "AivisSpeech",
      newGuildVoiceSpeakerId: "anneli",
      newGuildVoiceStyleId: "1",
    })
    const created = await repos.guildSettings.getOrCreate((await createTestGuild(db)).id)
    expect(created).toMatchObject({ maxCharacters: 80, voiceEngineId: "AivisSpeech", voiceSpeakerId: "anneli" })
    expect(await repos.guildSettings.getOrCreate(existing.id)).toMatchObject({
      maxCharacters: 200,
      voiceEngineId: "VOICEVOX",
    })
  })
})

describe("operatorRepository", () => {
  it("追加・権限の変更・一覧・削除", async () => {
    await repos.operators.upsert("400000000000000001", "VIEWER", null)
    await repos.operators.upsert("400000000000000002", "ADMIN", null)
    await repos.operators.upsert("400000000000000001", "EDITOR", null)
    expect((await repos.operators.list()).map((o) => [o.discordUserId, o.role])).toEqual([
      ["400000000000000002", "ADMIN"],
      ["400000000000000001", "EDITOR"],
    ])
    expect(await repos.operators.find("400000000000000001")).toMatchObject({ role: "EDITOR" })
    expect(await repos.operators.delete("400000000000000001")).toBe(true)
    expect(await repos.operators.delete("400000000000000001")).toBe(false)
  })
})

describe("利用停止", () => {
  it("サーバー・ユーザーの利用停止と再開。理由は停止中だけ持つ", async () => {
    const operator = await createTestUser(db)
    const guild = await createTestGuild(db)
    const user = await createTestUser(db)

    expect(await repos.guilds.setSuspension(guild.id, { reason: "規約違反", byUserId: operator.id })).toMatchObject({
      suspendedReason: "規約違反",
      suspendedByUserId: operator.id,
    })
    expect((await repos.guilds.setSuspension(guild.id, null)).suspendedAt).toBeNull()

    await repos.users.setSuspension(user.id, { reason: "スパム", byUserId: operator.id })
    expect(await repos.users.suspendedDiscordIds()).toEqual([user.discordUserId])
    await repos.users.setSuspension(user.id, null)
    expect(await repos.users.suspendedDiscordIds()).toEqual([])

    const invalid = await db.guild
      .update({ where: { id: guild.id }, data: { suspendedReason: "x" } })
      .catch(mapPrismaError)
    expect(invalid).toMatchObject({ code: "VALIDATION_ERROR" })
  })
})

describe("deleteUserData", () => {
  it("自鯖Worker を削除してからユーザーを削除し、辞書・監査ログは残す", async () => {
    const operator = await createTestUser(db)
    const user = await createTestUser(db)
    const guild = await createTestGuild(db)
    const worker = await createTestWorker(db, {
      ownerUserId: user.id,
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.SERVER }],
    })
    await db.guildSettings.create({ data: { guildId: guild.id, workerMode: "SPECIFIC", specificWorkerId: worker.id } })
    await db.userVoiceSettings.create({ data: { userId: user.id, engineId: "VOICEVOX", speakerId: "s", styleId: "1" } })
    const entry = await db.dictionaryEntry.create({
      data: { guildId: guild.id, word: "w", wordKey: "w", reading: "わら", createdByUserId: user.id },
    })
    await repos.audit.record({ actorUserId: user.id, action: "auth.login", targetType: "user" })

    expect(await deleteUserData(db, user.id, { actorUserId: operator.id, reason: "本人の依頼" })).toEqual({
      deletedWorkers: 1,
    })

    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await db.userVoiceSettings.count()).toBe(0)
    expect(await db.worker.findUniqueOrThrow({ where: { id: worker.id } })).toMatchObject({
      enabled: false,
      ownerUserId: null,
    })
    expect(await db.workerGuildPermission.count()).toBe(0)
    expect(await db.guildSettings.findUniqueOrThrow({ where: { guildId: guild.id } })).toMatchObject({
      workerMode: "AUTOMATIC",
    })
    expect(await db.dictionaryEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({
      createdByUserId: null,
    })
    expect(await db.auditLog.findFirst({ where: { action: "admin.user.delete" } })).toMatchObject({
      actorUserId: operator.id,
      targetId: user.discordUserId,
      metadata: { reason: "本人の依頼", deletedWorkers: 1 },
    })
    expect(await db.auditLog.count({ where: { action: "auth.login", actorUserId: null } })).toBe(1)
  })
})

describe("Worker の無効化 / 運営用の一覧", () => {
  it("無効化すると DISABLED、有効に戻すと OFFLINE", async () => {
    const worker = await createTestWorker(db)
    expect(await repos.workers.setEnabled(worker.id, false)).toMatchObject({ enabled: false, status: "DISABLED" })
    expect(await repos.workers.setEnabled(worker.id, true)).toMatchObject({ enabled: true, status: "OFFLINE" })
  })

  it("自鯖Worker を所有者で検索し、状態で絞り込み、接続先の数を返す", async () => {
    const alice = await createTestUser(db, { username: "alice" })
    const guild = await createTestGuild(db)
    const online = await createTestWorker(db, {
      ownerUserId: alice.id,
      name: "online",
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.PERSONAL }],
    })
    await db.worker.update({ where: { id: online.id }, data: { status: "ONLINE" } })
    const disabled = await createTestWorker(db, { ownerUserId: alice.id, name: "disabled" })
    await repos.workers.setEnabled(disabled.id, false)
    await createTestWorker(db, { name: "orphan" })
    await createTestWorker(db, { type: WorkerType.OFFICIAL, name: "official" })

    const byOwner = await repos.admin.privateWorkers({ take: 10, query: "alice" })
    expect(byOwner.items.map((w) => w.name).sort()).toEqual(["disabled", "online"])
    expect(byOwner.items.find((w) => w.name === "online")).toMatchObject({
      owner: { discordUsername: "alice" },
      _count: { guildPermissions: 1 },
    })
    expect((await repos.admin.privateWorkers({ take: 10, status: "connected" })).items.map((w) => w.name)).toEqual([
      "online",
    ])
    expect((await repos.admin.privateWorkers({ take: 10, status: "disabled" })).items.map((w) => w.name)).toEqual([
      "disabled",
    ])
    expect((await repos.admin.privateWorkers({ take: 10, status: "disconnected" })).items.map((w) => w.name)).toEqual([
      "orphan",
    ])
    expect((await repos.admin.workersOwnedBy(alice.id)).map((w) => w.name)).toEqual(["disabled", "online"])
    expect((await repos.admin.workerConnections(online.id)).map((c) => c.guild.discordGuildId)).toEqual([
      guild.discordGuildId,
    ])
    expect(await repos.admin.userDetail(alice.discordUserId)).toMatchObject({
      discordUsername: "alice",
      voiceSettings: null,
    })
  })
})
