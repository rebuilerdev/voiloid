import { createTestUser, createTestWorker } from "@voiloid/database/testing"
import { parseWorkerToken, redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { call, createHarness, installGuild, login, OPERATOR_ID, type Harness } from "../../test/harness"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

const operator = () => login(h, [], { discordUserId: OPERATOR_ID })

describe("運営者の判定", () => {
  it("/api/me に運営者かどうかを含める", async () => {
    expect((await call(h, "GET", "/api/me", { user: await operator() })).data()).toMatchObject({ isOperator: true })
    expect((await call(h, "GET", "/api/me", { user: await login(h) })).data()).toMatchObject({ isOperator: false })
  })

  it.each([
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/workers"],
    ["POST", "/api/admin/workers"],
    ["GET", "/api/admin/guilds"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/audit-logs"],
  ] as const)("運営者以外の %s %s は 404（存在を明かさない）", async (method, url) => {
    const res = await call(h, method, url, {
      user: await login(h),
      body: method === "POST" ? { name: "x", engines: ["VOICEVOX"] } : undefined,
    })
    expect(res.statusCode).toBe(404)
  })

  it("未ログインは 401、他サイトからの変更は 403", async () => {
    expect((await call(h, "GET", "/api/admin/overview")).statusCode).toBe(401)
    const res = await call(h, "POST", "/api/admin/workers", {
      user: await operator(),
      body: { name: "x", engines: ["VOICEVOX"] },
      origin: "https://evil.example.com",
    })
    expect(res.statusCode).toBe(403)
  })
})

describe("概要", () => {
  it("Bot・Worker・サーバー・ユーザー・利用量・最近の監査ログ", async () => {
    const user = await operator()
    const guild = await installGuild(h)
    const official = await createTestWorker(h.db, { type: "OFFICIAL" })
    await createTestWorker(h.db, { ownerUserId: user.id })
    await h.redis.set(
      redisKeys.workerLive(official.id),
      JSON.stringify({
        status: "online",
        runningJobs: 0,
        queue: 0,
        maxConcurrency: 2,
        lastSeenAt: new Date().toISOString(),
      }),
    )
    await h.redis.set(redisKeys.botHeartbeat(), JSON.stringify({ at: new Date().toISOString(), pingMs: 30 }))
    await h.db.usageEvent.create({
      data: { guildId: guild.id, engineId: "VOICEVOX", characters: 12, success: true, workerType: "OFFICIAL" },
    })
    await h.deps.repos.audit.record({ actorUserId: user.id, action: "worker.create", targetType: "worker" })

    expect((await call(h, "GET", "/api/admin/overview", { user })).data()).toMatchObject({
      bot: { status: "online", pingMs: 30 },
      workers: { official: { total: 1, online: 1 }, private: { total: 1, online: 0 } },
      guilds: { installed: 1, total: 1 },
      users: 1,
      usage: {
        today: { characters: 12, requests: 1, officialCharacters: 12, privateCharacters: 0 },
        last7Days: { characters: 12 },
      },
      recentAuditLogs: [{ action: "worker.create", actor: { id: OPERATOR_ID } }],
    })
  })
})

describe("公式Worker", () => {
  it("追加・一覧・名前変更・トークン再発行・削除を監査ログに残す", async () => {
    const user = await operator()
    const created = await call(h, "POST", "/api/admin/workers", {
      user,
      body: { name: "official-tokyo-01", engines: ["VOICEVOX", "AivisSpeech"] },
    })
    expect(created.statusCode).toBe(201)
    const { worker, token } = created.data() as { worker: { id: string; type: string }; token: string }
    expect(worker.type).toBe("official")
    expect(parseWorkerToken(token)?.publicId).toBe(worker.id)
    expect(await h.db.worker.findFirst({ where: { publicId: worker.id } })).toMatchObject({
      type: "OFFICIAL",
      ownerUserId: null,
    })

    // 自鯖Worker は運営コンソールに出さない
    await createTestWorker(h.db, { ownerUserId: user.id, name: "private" })
    const list = (await call(h, "GET", "/api/admin/workers", { user })).data() as { name: string }[]
    expect(list.map((w) => w.name)).toEqual(["official-tokyo-01"])

    const renamed = await call(h, "PATCH", `/api/admin/workers/${worker.id}`, {
      user,
      body: { name: "official-osaka-01" },
    })
    expect(renamed.data()).toMatchObject({ name: "official-osaka-01" })

    const rotated = (await call(h, "POST", `/api/admin/workers/${worker.id}/regenerate-token`, { user })).data() as {
      token: string
    }
    expect(rotated.token).not.toBe(token)

    expect((await call(h, "DELETE", `/api/admin/workers/${worker.id}`, { user })).statusCode).toBe(200)
    expect((await call(h, "GET", "/api/admin/workers", { user })).data()).toEqual([])

    const actions = (
      await h.db.auditLog.findMany({ where: { action: { startsWith: "admin." } }, orderBy: { id: "asc" } })
    ).map((a) => a.action)
    expect(actions).toEqual([
      "admin.worker.create",
      "admin.worker.rename",
      "admin.worker.rotate_token",
      "admin.worker.delete",
    ])
  })

  it("入力を検証する", async () => {
    const user = await operator()
    expect((await call(h, "POST", "/api/admin/workers", { user, body: { name: "", engines: [] } })).statusCode).toBe(
      400,
    )
    expect((await call(h, "PATCH", "/api/admin/workers/AAAAAAAAAAAAAAAAAAAA", { user, body: {} })).statusCode).toBe(400)
  })
})

describe("サーバー", () => {
  it("全サーバーを検索・ページングし、読み上げ状態・今日の読み上げ数を返す", async () => {
    const user = await operator()
    const a = await installGuild(h, "雑談サーバー")
    await installGuild(h, "ゲーム")
    await h.db.usageEvent.create({ data: { guildId: a.id, engineId: "VOICEVOX", characters: 1, success: true } })
    await h.redis.hset(
      redisKeys.guildSessions(a.discordGuildId),
      "bot",
      JSON.stringify({
        botUserId: "bot",
        textChannelId: "1",
        textChannelName: "聞き専",
        voiceChannelId: "2",
        voiceChannelName: "雑談",
        startedAt: new Date().toISOString(),
      }),
    )

    const page = (await call(h, "GET", "/api/admin/guilds", { user })).data() as {
      items: { name: string }[]
      nextCursor: string | null
    }
    expect(page.items.map((g) => g.name)).toEqual(["ゲーム", "雑談サーバー"])
    expect(page.nextCursor).toBeNull()
    const found = (await call(h, "GET", `/api/admin/guilds?query=${encodeURIComponent("雑談")}`, { user })).data()
    expect(found).toMatchObject({
      items: [{ id: a.discordGuildId, readingStatus: "active", messagesToday: 1, botInstalled: true }],
    })
    expect((await call(h, "GET", "/api/admin/guilds?cursor=not-uuid", { user })).statusCode).toBe(400)
  })

  it("サーバーの詳細（運営者はサーバーに参加していなくても見られる）", async () => {
    const user = await operator()
    const guild = await installGuild(h, "詳細")
    const owner = await createTestUser(h.db, { username: "owner" })
    await createTestWorker(h.db, {
      ownerUserId: owner.id,
      name: "shared",
      connections: [{ guildId: guild.id, scope: "SERVER" }],
    })
    await h.db.dictionaryEntry.create({ data: { guildId: guild.id, word: "w", wordKey: "w", reading: "わら" } })
    await h.deps.repos.audit.record({
      actorUserId: owner.id,
      guildId: guild.id,
      action: "dictionary.create",
      targetType: "dictionary",
    })

    const detail = (await call(h, "GET", `/api/admin/guilds/${guild.discordGuildId}`, { user })).data()
    expect(detail).toMatchObject({
      name: "詳細",
      settings: { readingMode: "command", workerMode: "auto" },
      workers: [{ name: "shared", scope: "server", status: "offline", ownerName: "owner" }],
      dictionaryEntries: 1,
      usage30Days: { characters: 0 },
      auditLogs: [{ action: "dictionary.create", guild: { name: "詳細" } }],
    })
    expect((detail as { usage30Days: { daily: unknown[] } }).usage30Days.daily).toHaveLength(30)
    expect((await call(h, "GET", "/api/admin/guilds/100000000000000000", { user })).statusCode).toBe(404)
  })
})

describe("ユーザー・監査ログ", () => {
  it("ユーザーを検索し、運営者かどうか・自鯖Worker 数を返す", async () => {
    const user = await operator()
    const other = await createTestUser(h.db, { username: "someone" })
    await createTestWorker(h.db, { ownerUserId: other.id })
    const page = (await call(h, "GET", "/api/admin/users?query=someone", { user })).data()
    expect(page).toMatchObject({
      items: [{ username: "someone", privateWorkers: 1, isOperator: false, hasVoice: false }],
      nextCursor: null,
    })
    const me = (await call(h, "GET", `/api/admin/users?query=${OPERATOR_ID}`, { user })).data()
    expect(me).toMatchObject({ items: [{ id: OPERATOR_ID, isOperator: true }] })
  })

  it("監査ログを操作の種類・サーバーで絞り込む", async () => {
    const user = await operator()
    const guild = await installGuild(h)
    await h.deps.repos.audit.record({
      actorUserId: null,
      guildId: guild.id,
      action: "guild.settings.update",
      targetType: "guild",
    })
    await h.deps.repos.audit.record({ actorUserId: null, action: "worker.create", targetType: "worker" })

    const byAction = (await call(h, "GET", "/api/admin/audit-logs?action=worker.", { user })).data() as {
      items: { action: string }[]
    }
    expect(byAction.items.map((l) => l.action)).toEqual(["worker.create"])
    const byGuild = (
      await call(h, "GET", `/api/admin/audit-logs?guildId=${guild.discordGuildId}`, { user })
    ).data() as { items: { action: string }[] }
    expect(byGuild.items.map((l) => l.action)).toEqual(["guild.settings.update"])
    expect((await call(h, "GET", "/api/admin/audit-logs?guildId=100000000000000000", { user })).data()).toEqual({
      items: [],
      nextCursor: null,
    })
    expect((await call(h, "GET", "/api/admin/audit-logs?action=DROP%20TABLE", { user })).statusCode).toBe(400)
  })
})
