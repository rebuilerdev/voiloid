import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  createTestGuild,
  createTestUser,
  createTestWorker,
  resetTestDatabase,
} from "../../test/helpers"
import { WorkerGuildScope, WorkerType } from "../generated/prisma/client"
import { createRepositories } from "./index"

const db = createTestDatabase()
const repos = createRepositories(db)

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

describe("adminRepository", () => {
  it("サーバー・ユーザー・Worker の件数（削除済みの Worker を除き、接続中を数える）", async () => {
    await createTestGuild(db)
    await createTestGuild(db, { botInstalled: false })
    const user = await createTestUser(db)
    const online = await createTestWorker(db, { type: WorkerType.OFFICIAL })
    await createTestWorker(db, { type: WorkerType.OFFICIAL })
    await db.worker.update({ where: { id: online.id }, data: { status: "BUSY" } })
    await createTestWorker(db, { ownerUserId: user.id })
    const deleted = await createTestWorker(db, { ownerUserId: user.id })
    await db.worker.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })

    expect(await repos.admin.counts()).toEqual({
      installedGuilds: 1,
      totalGuilds: 2,
      users: 1,
      officialWorkers: { total: 2, online: 1 },
      privateWorkers: { total: 1, online: 0 },
    })
  })

  it("全サーバーの利用量を Worker の種別ごとに合計する（失敗・期間外を除く）", async () => {
    const [a, b] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    await db.usageEvent.createMany({
      data: [
        { guildId: a.id, engineId: "VOICEVOX", characters: 10, success: true, workerType: "OFFICIAL" },
        { guildId: b.id, engineId: "VOICEVOX", characters: 5, success: true, workerType: "PRIVATE" },
        { guildId: b.id, engineId: "VOICEVOX", characters: 99, success: false, workerType: "PRIVATE" },
        {
          guildId: b.id,
          engineId: "VOICEVOX",
          characters: 7,
          success: true,
          workerType: "OFFICIAL",
          createdAt: new Date("2020-01-01"),
        },
      ],
    })
    expect(await repos.admin.usageTotals(new Date(Date.now() - 60_000))).toEqual({
      characters: 15,
      requests: 2,
      officialCharacters: 10,
      privateCharacters: 5,
    })
  })

  it("サーバーを名前・ID で検索し、新しい順にページングする", async () => {
    const guilds = []
    for (const name of ["Alpha", "Beta", "alpha2"]) guilds.push(await createTestGuild(db, { name }))
    const first = await repos.admin.guilds({ take: 2 })
    expect(first.items.map((g) => g.name)).toEqual(["alpha2", "Beta"])
    expect(first.nextCursor).toBe(guilds[1]!.id)
    const second = await repos.admin.guilds({ take: 2, cursor: first.nextCursor! })
    expect(second).toEqual({ items: [expect.objectContaining({ name: "Alpha" })], nextCursor: null })

    expect((await repos.admin.guilds({ take: 10, query: "ALPHA" })).items.map((g) => g.name)).toEqual([
      "alpha2",
      "Alpha",
    ])
    const byId = await repos.admin.guilds({ take: 10, query: guilds[1]!.discordGuildId })
    expect(byId.items.map((g) => g.name)).toEqual(["Beta"])
  })

  it("サーバーごとの読み上げ数をまとめて数える", async () => {
    const [a, b] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    await db.usageEvent.createMany({
      data: [
        { guildId: a.id, engineId: "VOICEVOX", characters: 1, success: true },
        { guildId: a.id, engineId: "VOICEVOX", characters: 1, success: true },
        { guildId: a.id, engineId: "VOICEVOX", characters: 1, success: false },
      ],
    })
    const counts = await repos.admin.messagesSince([a.id, b.id], new Date(Date.now() - 60_000))
    expect(Object.fromEntries(counts)).toEqual({ [a.id]: 2 })
    expect(await repos.admin.messagesSince([], new Date())).toEqual(new Map())
  })

  it("サーバーの詳細: 設定・接続された Worker（削除済みを除く）・辞書の件数", async () => {
    const guild = await createTestGuild(db)
    const owner = await createTestUser(db, { username: "owner" })
    await db.guildSettings.create({ data: { guildId: guild.id, readingMode: "COMMAND" } })
    await createTestWorker(db, {
      ownerUserId: owner.id,
      name: "shared",
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.SERVER }],
    })
    const gone = await createTestWorker(db, {
      ownerUserId: owner.id,
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.PERSONAL }],
    })
    await db.worker.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    await db.dictionaryEntry.create({ data: { guildId: guild.id, word: "w", wordKey: "w", reading: "わら" } })

    const detail = await repos.admin.guildDetail(guild.discordGuildId)
    expect(detail?.settings?.readingMode).toBe("COMMAND")
    expect(detail?.workerPermissions.map((p) => [p.worker.name, p.scope, p.worker.owner?.discordUsername])).toEqual([
      ["shared", "SERVER", "owner"],
    ])
    expect(detail?._count.dictionaryEntries).toBe(1)
    expect(await repos.admin.guildDetail("0")).toBeNull()
  })

  it("ユーザーを検索し、自鯖Worker 数（削除済み・公式を除く）とマイボイスの有無を返す", async () => {
    const alice = await createTestUser(db, { username: "alice" })
    await createTestUser(db, { username: "bob" })
    await db.user.update({ where: { id: alice.id }, data: { discordGlobalName: "アリス" } })
    await createTestWorker(db, { ownerUserId: alice.id })
    const deleted = await createTestWorker(db, { ownerUserId: alice.id })
    await db.worker.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })
    await db.userVoiceSettings.create({
      data: { userId: alice.id, engineId: "VOICEVOX", speakerId: "s", styleId: "1" },
    })

    const page = await repos.admin.users({ take: 10, query: "アリス" })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      discordUsername: "alice",
      _count: { workers: 1 },
      voiceSettings: { userId: alice.id },
    })
    expect((await repos.admin.users({ take: 1 })).nextCursor).not.toBeNull()
    expect((await repos.admin.users({ take: 10, query: alice.discordUserId })).items).toHaveLength(1)
  })

  it("監査ログを操作の種類（前方一致）・サーバーで絞り込み、実行者とサーバーを含める", async () => {
    const guild = await createTestGuild(db, { name: "サーバー" })
    const user = await createTestUser(db, { username: "op" })
    await repos.audit.record({
      actorUserId: user.id,
      guildId: guild.id,
      action: "guild.settings.update",
      targetType: "guild",
    })
    await repos.audit.record({ actorUserId: null, action: "worker.create", targetType: "worker" })
    await repos.audit.record({ actorUserId: null, action: "worker.delete", targetType: "worker" })

    const all = await repos.admin.auditLogs({ take: 2 })
    expect(all.items.map((l) => l.action)).toEqual(["worker.delete", "worker.create"])
    expect(all.nextCursor).not.toBeNull()
    expect((await repos.admin.auditLogs({ take: 10, actionPrefix: "worker." })).items).toHaveLength(2)
    const byGuild = await repos.admin.auditLogs({ take: 10, guildId: guild.id })
    expect(byGuild.items[0]).toMatchObject({
      action: "guild.settings.update",
      actor: { discordUsername: "op" },
      guild: { name: "サーバー" },
    })
  })

  it("公式Worker（削除済み・自鯖Worker を除く）", async () => {
    const a = await createTestWorker(db, { type: WorkerType.OFFICIAL, name: "a" })
    const b = await createTestWorker(db, { type: WorkerType.OFFICIAL, name: "b" })
    await createTestWorker(db, { name: "private" })
    await db.worker.update({ where: { id: b.id }, data: { deletedAt: new Date() } })
    const workers = await repos.admin.officialWorkers()
    expect(workers.map((w) => w.id)).toEqual([a.id])
    expect(JSON.stringify(workers)).not.toContain("secretHash")
  })
})
