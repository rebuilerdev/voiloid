import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, createTestGuild, createTestWorker, resetTestDatabase } from "../../test/helpers"
import { WorkerType } from "../generated/prisma/client"
import { createRepositories } from "./index"

const db = createTestDatabase()
const repos = createRepositories(db)

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

const event = (guildId: string, patch: Partial<Parameters<typeof repos.usage.record>[0]> = {}) =>
  repos.usage.record({
    userId: null,
    guildId,
    workerId: null,
    workerType: WorkerType.OFFICIAL,
    engineId: "VOICEVOX",
    characters: 10,
    audioDurationMs: 1000,
    success: true,
    ...patch,
  })

const at = (iso: string) => ({ createdAt: new Date(iso) })

describe("usageRepository", () => {
  it("期間内の成功した合成を、Worker 種別・サーバー・日付（指定タイムゾーン）ごとに集計する", async () => {
    const [a, b] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    const worker = await createTestWorker(db)
    await event(a.id, { characters: 100 })
    await event(a.id, { characters: 50, workerId: worker.id, workerType: WorkerType.PRIVATE })
    await event(b.id, { characters: 7 })
    await event(a.id, { characters: 999, success: false })

    // 日付の区切り: UTC 2026-10-08 15:30 は JST 2026-10-09 00:30
    await db.usageEvent.updateMany({ where: { characters: 100 }, data: at("2026-10-08T15:30:00Z") })
    await db.usageEvent.updateMany({ where: { characters: 50 }, data: at("2026-10-08T14:30:00Z") })
    await db.usageEvent.updateMany({ where: { characters: 7 }, data: at("2026-10-09T03:00:00Z") })
    await db.usageEvent.updateMany({ where: { characters: 999 }, data: at("2026-10-09T03:00:00Z") })

    const summary = await repos.usage.summarize({
      guildIds: [a.id, b.id],
      since: new Date("2026-10-01T00:00:00Z"),
      timeZone: "Asia/Tokyo",
    })

    expect(summary.byWorkerType).toEqual(
      expect.arrayContaining([
        { workerType: "OFFICIAL", characters: 107, requests: 2 },
        { workerType: "PRIVATE", characters: 50, requests: 1 },
      ]),
    )
    expect(summary.byGuild).toEqual(
      expect.arrayContaining([
        { guildId: a.id, characters: 150, requests: 2 },
        { guildId: b.id, characters: 7, requests: 1 },
      ]),
    )
    expect(summary.daily).toEqual([
      { date: "2026-10-08", characters: 50, requests: 1 },
      { date: "2026-10-09", characters: 107, requests: 2 },
    ])
  })

  it("対象外のサーバー・期間外は集計しない", async () => {
    const [mine, other] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    await event(mine.id)
    await event(other.id)
    await db.usageEvent.updateMany({ where: { guildId: mine.id }, data: at("2026-01-01T00:00:00Z") })

    const summary = await repos.usage.summarize({
      guildIds: [mine.id],
      since: new Date("2026-10-01T00:00:00Z"),
      timeZone: "Asia/Tokyo",
    })
    expect(summary).toEqual({ byWorkerType: [], byGuild: [], daily: [] })
    expect(await repos.usage.summarize({ guildIds: [], since: new Date(0), timeZone: "UTC" })).toEqual({
      byWorkerType: [],
      byGuild: [],
      daily: [],
    })
  })

  it("タイムゾーン名は SQL に埋め込まず、パラメータとして渡す", async () => {
    const guild = await createTestGuild(db)
    await event(guild.id)
    const malicious = 'UTC\'; DROP TABLE "UsageEvent"; --'
    await expect(
      repos.usage.summarize({ guildIds: [guild.id], since: new Date(0), timeZone: malicious }),
    ).rejects.toThrow()
    expect(await db.usageEvent.count()).toBe(1)
  })

  it("指定時刻以降の読み上げ数と、サーバーごとの最終利用日時", async () => {
    const [a, b, c] = await Promise.all([createTestGuild(db), createTestGuild(db), createTestGuild(db)])
    await event(a.id)
    await event(a.id)
    await event(a.id, { success: false })
    await event(b.id)
    await db.usageEvent.updateMany({ where: { guildId: b.id }, data: at("2026-01-01T00:00:00Z") })

    expect(await repos.usage.countSince(a.id, new Date(Date.now() - 60_000))).toBe(2)
    const last = await repos.usage.lastActivity([a.id, b.id, c.id])
    expect(last.get(b.id)).toEqual(new Date("2026-01-01T00:00:00Z"))
    expect(last.has(a.id)).toBe(true)
    expect(last.has(c.id)).toBe(false)
  })
})
