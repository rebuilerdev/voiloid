import { createTestUser, createTestWorker, snowflake } from "@voiloid/database/testing"
import { parseWorkerToken, redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { call, createHarness, installGuild, login, NO_PERMISSIONS, type Harness } from "../../test/harness"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

type ApiWorker = { id: string; name: string; type: string; status: string; runningJobs: number; engines: unknown[] }

async function createWorker(user: Awaited<ReturnType<typeof login>>, name = "home", engines = ["VOICEVOX"]) {
  const res = await call(h, "POST", "/api/workers", { user, body: { name, engines } })
  expect(res.statusCode).toBe(201)
  return res.data() as { worker: ApiWorker; token: string }
}

describe("Worker の登録・取得", () => {
  it("登録すると一度だけトークンを返し、DB にはハッシュだけを保存する", async () => {
    const user = await login(h)
    const { worker, token } = await createWorker(user)
    const parsed = parseWorkerToken(token)
    expect(parsed?.publicId).toBe(worker.id)
    expect(worker).toMatchObject({ name: "home", type: "private", status: "offline", runningJobs: 0 })

    const credential = await h.db.workerCredential.findFirstOrThrow()
    expect(credential.secretHash).not.toContain(parsed!.secret)
    // 取得 API はトークンを返さない
    const detail = await call(h, "GET", `/api/workers/${worker.id}`, { user })
    expect(JSON.stringify(detail.json())).not.toContain(parsed!.secret)
  })

  it("一覧は公式Worker と自分の Worker。他人の Worker・公式Worker の詳細は 404", async () => {
    const [me, other] = await Promise.all([login(h), login(h)])
    const official = await createTestWorker(h.db, { type: "OFFICIAL", name: "official-01" })
    const mine = await createWorker(me, "mine")
    const theirs = await createWorker(other, "theirs")

    const list = (await call(h, "GET", "/api/workers", { user: me })).data() as ApiWorker[]
    expect(list.map((w) => w.name)).toEqual(["official-01", "mine"])

    expect((await call(h, "GET", `/api/workers/${official.publicId}`, { user: me })).statusCode).toBe(404)
    expect((await call(h, "GET", `/api/workers/${theirs.worker.id}`, { user: me })).statusCode).toBe(404)
    expect((await call(h, "DELETE", `/api/workers/${theirs.worker.id}`, { user: me })).statusCode).toBe(404)
    expect((await call(h, "GET", `/api/workers/${mine.worker.id}`, { user: me })).statusCode).toBe(200)
    expect((await call(h, "GET", "/api/workers/bad!", { user: me })).statusCode).toBe(404)
  })

  it("Redis のリアルタイム状態を反映し、状態が切れていれば切断として扱う", async () => {
    const user = await login(h)
    const { worker } = await createWorker(user)
    const row = await h.db.worker.findFirstOrThrow({ where: { publicId: worker.id } })
    await h.db.worker.update({ where: { id: row.id }, data: { status: "ONLINE" } })

    expect(((await call(h, "GET", `/api/workers/${worker.id}`, { user })).data() as ApiWorker).status).toBe("offline")

    await h.redis.set(
      redisKeys.workerLive(row.id),
      JSON.stringify({
        status: "busy",
        runningJobs: 2,
        queue: 1,
        maxConcurrency: 2,
        latencyMs: 15,
        lastSeenAt: new Date().toISOString(),
      }),
    )
    expect((await call(h, "GET", `/api/workers/${worker.id}`, { user })).data()).toMatchObject({
      status: "busy",
      runningJobs: 2,
      queue: 1,
      latency: 15,
    })
  })

  it.each([
    ["空の名前", { name: " ", engines: ["VOICEVOX"] }],
    ["エンジンなし", { name: "a", engines: [] }],
    ["未知のエンジン", { name: "a", engines: ["unknown"] }],
  ])("%s は 400", async (_label, body) => {
    const user = await login(h)
    expect((await call(h, "POST", "/api/workers", { user, body })).statusCode).toBe(400)
  })

  it("登録数の上限（サービス全体の設定）を超えたら 400", async () => {
    const user = await login(h)
    await h.deps.repos.system.update({ maxWorkersPerUser: 3 })
    for (let i = 0; i < 3; i++) await createWorker(user, `w${i}`)
    expect(
      (await call(h, "POST", "/api/workers", { user, body: { name: "over", engines: ["VOICEVOX"] } })).statusCode,
    ).toBe(400)
  })
})

describe("Worker の変更・削除・トークン再発行", () => {
  it("名前を変更できる", async () => {
    const user = await login(h)
    const { worker } = await createWorker(user)
    const res = await call(h, "PATCH", `/api/workers/${worker.id}`, { user, body: { name: "renamed" } })
    expect(res.data()).toMatchObject({ name: "renamed" })
    expect(
      (await call(h, "PATCH", `/api/workers/${worker.id}`, { user, body: { name: "x".repeat(65) } })).statusCode,
    ).toBe(400)
  })

  it("削除すると一覧から消え、Gateway に切断を通知する", async () => {
    const user = await login(h)
    const { worker } = await createWorker(user)
    const subscriber = h.redis.duplicate()
    const messages: string[] = []
    await subscriber.subscribe(redisKeys.invalidation())
    subscriber.on("message", (_c, m: string) => messages.push(m))

    expect((await call(h, "DELETE", `/api/workers/${worker.id}`, { user })).data()).toBeNull()
    expect((await call(h, "GET", `/api/workers/${worker.id}`, { user })).statusCode).toBe(404)
    expect((await call(h, "GET", "/api/workers", { user })).data()).toEqual([])

    await new Promise((r) => setTimeout(r, 50))
    expect(messages).toContain(JSON.stringify({ kind: "worker", workerId: worker.id }))
    subscriber.disconnect()
  })

  it("トークンを再発行すると古いトークンは使えなくなる", async () => {
    const user = await login(h)
    const { worker, token } = await createWorker(user)
    const before = await h.db.workerCredential.findFirstOrThrow()
    const res = await call(h, "POST", `/api/workers/${worker.id}/regenerate-token`, { user })
    const { token: next } = res.data() as { token: string }
    expect(next).not.toBe(token)
    const after = await h.db.workerCredential.findFirstOrThrow()
    expect(after.secretHash).not.toBe(before.secretHash)
  })
})

describe("接続するサーバー", () => {
  it("参加している Bot 導入済みのサーバーと、接続状態・管理権限を返す", async () => {
    const [managed, member] = await Promise.all([installGuild(h, "管理"), installGuild(h, "参加のみ")])
    const user = await login(h, [
      { id: managed.discordGuildId, name: "管理" },
      { id: member.discordGuildId, name: "参加のみ", permissions: NO_PERMISSIONS },
      { id: snowflake(), name: "Bot 未導入" },
    ])
    const { worker } = await createWorker(user)
    const res = await call(h, "GET", `/api/workers/${worker.id}/guilds`, { user })
    expect(res.data()).toEqual([
      { guildId: managed.discordGuildId, guildName: "管理", canManage: true, scope: "none" },
      { guildId: member.discordGuildId, guildName: "参加のみ", canManage: false, scope: "none" },
    ])
  })

  it("管理しているサーバーには共有、参加しているだけのサーバーには自分専用で接続できる", async () => {
    const [managed, member] = await Promise.all([installGuild(h), installGuild(h)])
    const user = await login(h, [
      { id: managed.discordGuildId },
      { id: member.discordGuildId, permissions: NO_PERMISSIONS },
    ])
    const { worker } = await createWorker(user)
    const url = `/api/workers/${worker.id}/guilds`
    const res = await call(h, "PUT", url, {
      user,
      body: {
        connections: [
          { guildId: managed.discordGuildId, scope: "server" },
          { guildId: member.discordGuildId, scope: "personal" },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const scopes = (await call(h, "GET", url, { user })).data() as { scope: string }[]
    expect(scopes.map((s) => s.scope)).toEqual(["server", "personal"])
  })

  it("管理権限の無いサーバーへの共有は 403、参加していないサーバーは 404", async () => {
    const member = await installGuild(h)
    const outside = await installGuild(h)
    const user = await login(h, [{ id: member.discordGuildId, permissions: NO_PERMISSIONS }])
    const { worker } = await createWorker(user)
    const url = `/api/workers/${worker.id}/guilds`

    const shared = await call(h, "PUT", url, {
      user,
      body: { connections: [{ guildId: member.discordGuildId, scope: "server" }] },
    })
    expect(shared.statusCode).toBe(403)
    const unknown = await call(h, "PUT", url, {
      user,
      body: { connections: [{ guildId: outside.discordGuildId, scope: "personal" }] },
    })
    expect(unknown.statusCode).toBe(404)
    expect(await h.db.workerGuildPermission.count()).toBe(0)
  })

  it("サーバーに共有された Worker の一覧（他のユーザーが共有したものを含み、自分専用は含まない）", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    const other = await createTestUser(h.db)
    const shared = await createTestWorker(h.db, {
      ownerUserId: other.id,
      name: "共有",
      connections: [{ guildId: guild.id, scope: "SERVER" }],
    })
    await createTestWorker(h.db, {
      ownerUserId: other.id,
      name: "自分専用",
      connections: [{ guildId: guild.id, scope: "PERSONAL" }],
    })
    const list = (await call(h, "GET", `/api/guilds/${guild.discordGuildId}/workers`, { user })).data() as ApiWorker[]
    expect(list.map((w) => [w.id, w.name])).toEqual([[shared.publicId, "共有"]])

    const member = await login(h, [{ id: guild.discordGuildId, permissions: NO_PERMISSIONS }])
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}/workers`, { user: member })).statusCode).toBe(403)
  })

  it("他人の Worker の接続先は変更できない", async () => {
    const guild = await installGuild(h)
    const [me, other] = await Promise.all([login(h, [{ id: guild.discordGuildId }]), createTestUser(h.db)])
    const theirs = await createTestWorker(h.db, { ownerUserId: other.id })
    const res = await call(h, "PUT", `/api/workers/${theirs.publicId}/guilds`, {
      user: me,
      body: { connections: [{ guildId: guild.discordGuildId, scope: "server" }] },
    })
    expect(res.statusCode).toBe(404)
  })
})
