/**
 * 運営コンソール: 権限・サーバー / ユーザー / Worker の操作・サービス全体の設定・運営者の管理。
 */
import { createTestUser, createTestWorker, snowflake } from "@voiloid/database/testing"
import { redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { call, createHarness, installGuild, login, NO_PERMISSIONS, OPERATOR_ID, type Harness } from "../../test/harness"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

const owner = () => login(h, [], { discordUserId: OPERATOR_ID })

/** Web で追加した運営者としてログインする */
async function operatorAs(role: "ADMIN" | "EDITOR" | "VIEWER") {
  const id = snowflake()
  await h.deps.repos.operators.upsert(id, role, null)
  return login(h, [], { discordUserId: id })
}

const reason = { reason: "規約違反のため" }

describe("運営者の権限", () => {
  it("/api/me に権限を含める", async () => {
    expect((await call(h, "GET", "/api/me", { user: await owner() })).data()).toMatchObject({ operatorRole: "owner" })
    expect((await call(h, "GET", "/api/me", { user: await operatorAs("EDITOR") })).data()).toMatchObject({
      isOperator: true,
      operatorRole: "editor",
    })
    expect((await call(h, "GET", "/api/me", { user: await login(h) })).data()).toMatchObject({ operatorRole: null })
  })

  it("viewer は閲覧だけ、editor は変更、admin は運営者の管理・全体設定ができる", async () => {
    const guild = await installGuild(h)
    const viewer = await operatorAs("VIEWER")
    const editor = await operatorAs("EDITOR")
    const admin = await operatorAs("ADMIN")

    expect((await call(h, "GET", "/api/admin/overview", { user: viewer })).statusCode).toBe(200)
    expect(
      (await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/suspend`, { user: viewer, body: reason }))
        .statusCode,
    ).toBe(403)

    expect(
      (await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/suspend`, { user: editor, body: reason }))
        .statusCode,
    ).toBe(200)
    expect(
      (await call(h, "PATCH", "/api/admin/system", { user: editor, body: { readingPaused: true } })).statusCode,
    ).toBe(403)
    expect(
      (
        await call(h, "POST", "/api/admin/operators", {
          user: editor,
          body: { discordUserId: snowflake(), role: "viewer" },
        })
      ).statusCode,
    ).toBe(403)

    expect(
      (await call(h, "PATCH", "/api/admin/system", { user: admin, body: { readingPaused: true } })).statusCode,
    ).toBe(200)
  })
})

describe("サーバーの操作", () => {
  it("editor 以上の運営者は、参加していないサーバーの設定・辞書を変更でき、監査ログに運営者として残る", async () => {
    const guild = await installGuild(h)
    const editor = await operatorAs("EDITOR")
    h.discord.channels.set(guild.discordGuildId, [])

    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user: editor })).statusCode).toBe(200)
    const res = await call(h, "PATCH", `/api/guilds/${guild.discordGuildId}/settings`, {
      user: editor,
      body: { readUrls: true },
    })
    expect(res.data()).toMatchObject({ readUrls: true })
    const word = await call(h, "POST", `/api/guilds/${guild.discordGuildId}/dictionary`, {
      user: editor,
      body: { word: "w", reading: "わら" },
    })
    expect(word.statusCode).toBe(201)
    const profile = await call(h, "PATCH", `/api/guilds/${guild.discordGuildId}/bot-profile`, {
      user: editor,
      body: { nickname: "運営" },
    })
    expect(profile.statusCode).toBe(200)

    const logs = await h.db.auditLog.findMany({ where: { guildId: guild.id }, orderBy: { id: "asc" } })
    expect(logs.map((l) => [l.action, l.metadata])).toEqual([
      ["guild.settings.update", { fields: ["readUrls"], asOperator: true }],
      ["dictionary.create", { asOperator: true }],
      ["guild.bot_profile.update", { nickname: "changed", avatar: "unchanged", asOperator: true }],
    ])

    // viewer は管理画面を使えない
    const viewer = await operatorAs("VIEWER")
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user: viewer })).statusCode).toBe(404)
  })

  it("利用停止: 読み上げ終了を Bot に指示し、サーバー管理者は設定を変更できなくなる。運営者は操作でき、再開できる", async () => {
    const guild = await installGuild(h)
    const manager = await login(h, [{ id: guild.discordGuildId }])
    const user = await owner()

    expect(
      (await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/suspend`, { user, body: { reason: "" } }))
        .statusCode,
    ).toBe(400)
    expect(
      (await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/suspend`, { user, body: reason })).statusCode,
    ).toBe(200)
    expect(h.bot.commands).toContainEqual({ kind: "stop-sessions", guildId: guild.discordGuildId })

    const detail = (await call(h, "GET", `/api/admin/guilds/${guild.discordGuildId}`, { user })).data()
    expect(detail).toMatchObject({
      suspended: true,
      readingStatus: "disabled",
      suspension: { reason: "規約違反のため", by: { id: OPERATOR_ID } },
    })
    expect((await call(h, "GET", "/api/guilds", { user: manager })).data()).toMatchObject([
      { suspended: true, readingEnabled: false },
    ])
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}/settings`, { user: manager })).statusCode).toBe(
      403,
    )

    await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/unsuspend`, { user })
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}/settings`, { user: manager })).statusCode).toBe(
      200,
    )
    const actions = (
      await h.db.auditLog.findMany({ where: { action: { startsWith: "admin.guild" } }, orderBy: { id: "asc" } })
    ).map((l) => l.action)
    expect(actions).toEqual(["admin.guild.suspend", "admin.guild.unsuspend"])
  })

  it("読み上げの強制終了・Bot の退出（admin）。Bot が失敗したら 503", async () => {
    const guild = await installGuild(h)
    const user = await owner()
    expect((await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/stop-sessions`, { user })).data()).toEqual(
      { ok: true },
    )

    const editor = await operatorAs("EDITOR")
    expect(
      (await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/leave`, { user: editor, body: reason }))
        .statusCode,
    ).toBe(403)

    h.bot.result = { ok: false, message: "missing permissions" }
    const failed = await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/leave`, { user, body: reason })
    expect(failed.statusCode).toBe(503)
    expect((await h.deps.repos.guilds.findByDiscordId(guild.discordGuildId))?.botInstalled).toBe(true)

    h.bot.result = { ok: true }
    await call(h, "POST", `/api/admin/guilds/${guild.discordGuildId}/leave`, { user, body: reason })
    expect(h.bot.commands).toContainEqual({ kind: "leave-guild", guildId: guild.discordGuildId })
    expect((await h.deps.repos.guilds.findByDiscordId(guild.discordGuildId))?.botInstalled).toBe(false)
  })

  it("サーバーから自鯖Worker の接続を外す", async () => {
    const guild = await installGuild(h)
    const someone = await createTestUser(h.db)
    const worker = await createTestWorker(h.db, {
      ownerUserId: someone.id,
      connections: [{ guildId: guild.id, scope: "SERVER" }],
    })
    await h.db.guildSettings.create({
      data: { guildId: guild.id, workerMode: "SPECIFIC", specificWorkerId: worker.id },
    })
    const user = await owner()
    const url = `/api/admin/guilds/${guild.discordGuildId}/workers/${worker.publicId}`
    expect((await call(h, "DELETE", url, { user })).statusCode).toBe(200)
    expect(await h.db.workerGuildPermission.count()).toBe(0)
    expect(await h.db.guildSettings.findUniqueOrThrow({ where: { guildId: guild.id } })).toMatchObject({
      workerMode: "AUTOMATIC",
    })
    expect((await call(h, "DELETE", url, { user })).statusCode).toBe(404)
  })
})

describe("ユーザーの操作", () => {
  it("詳細・マイボイスの変更・強制ログアウト", async () => {
    const user = await owner()
    const target = await login(h)
    const worker = await createTestWorker(h.db, { ownerUserId: target.id, name: "pc" })
    await login(h, [], { discordUserId: target.discordUserId })

    const detail = (await call(h, "GET", `/api/admin/users/${target.discordUserId}`, { user })).data()
    expect(detail).toMatchObject({
      id: target.discordUserId,
      sessions: 2,
      voice: null,
      workers: [{ id: worker.publicId, name: "pc", enabled: true }],
    })

    const voice = { engine: "VOICEVOX", speakerId: "s", styleId: "3", speed: 1, pitch: 0, intonation: 1 }
    await call(h, "PUT", `/api/admin/users/${target.discordUserId}/voice`, { user, body: { voice } })
    expect((await call(h, "GET", "/api/me", { user: target })).data()).toMatchObject({ voice })

    expect((await call(h, "POST", `/api/admin/users/${target.discordUserId}/logout`, { user })).data()).toEqual({
      sessions: 2,
    })
    expect((await call(h, "GET", "/api/me", { user: target })).statusCode).toBe(401)
    expect((await call(h, "GET", "/api/admin/users/100000000000000000", { user })).statusCode).toBe(404)
  })

  it("利用停止: ログイン中のセッションを無効にし、再ログインもできない。再開できる", async () => {
    const user = await owner()
    const target = await login(h)
    await call(h, "POST", `/api/admin/users/${target.discordUserId}/suspend`, { user, body: reason })
    expect((await call(h, "GET", "/api/me", { user: target })).statusCode).toBe(401)
    expect((await call(h, "GET", "/api/admin/users?query=" + target.discordUserId, { user })).data()).toMatchObject({
      items: [{ suspended: true }],
    })

    // 再ログイン（OAuth のコールバック）は拒否される
    h.discord.codes.set("code", target.accessToken)
    const start = await h.app.inject({ method: "GET", url: "/api/auth/login" })
    const state = new URL(String(start.headers.location)).searchParams.get("state")!
    const callback = await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=code&state=${state}`,
      headers: { cookie: `voiloid_oauth_state=${state}` },
    })
    expect(callback.headers.location).toBe("/login?error=suspended")

    await call(h, "POST", `/api/admin/users/${target.discordUserId}/unsuspend`, { user })
    expect((await h.deps.repos.users.findByDiscordId(target.discordUserId))?.suspendedAt).toBeNull()
  })

  it("自分自身・owner は利用停止・削除できない", async () => {
    const user = await owner()
    const editor = await operatorAs("EDITOR")
    expect((await call(h, "POST", `/api/admin/users/${OPERATOR_ID}/suspend`, { user, body: reason })).statusCode).toBe(
      403,
    )
    expect(
      (await call(h, "POST", `/api/admin/users/${OPERATOR_ID}/suspend`, { user: editor, body: reason })).statusCode,
    ).toBe(403)
    expect(
      (await call(h, "POST", `/api/admin/users/${editor.discordUserId}/suspend`, { user: editor, body: reason }))
        .statusCode,
    ).toBe(403)
  })

  it("データの削除（admin）: Worker を削除し、ユーザーを削除する", async () => {
    const user = await owner()
    const target = await login(h)
    await createTestWorker(h.db, { ownerUserId: target.id })
    await h.deps.repos.operators.upsert(target.discordUserId, "VIEWER", null)
    const editor = await operatorAs("EDITOR")
    expect(
      (await call(h, "POST", `/api/admin/users/${target.discordUserId}/delete`, { user: editor, body: reason }))
        .statusCode,
    ).toBe(403)

    const res = await call(h, "POST", `/api/admin/users/${target.discordUserId}/delete`, { user, body: reason })
    expect(res.data()).toEqual({ deletedWorkers: 1 })
    expect(await h.deps.repos.users.findByDiscordId(target.discordUserId)).toBeNull()
    expect(await h.deps.repos.operators.find(target.discordUserId)).toBeNull()
    expect((await call(h, "GET", "/api/me", { user: target })).statusCode).toBe(401)
  })
})

describe("Worker の操作", () => {
  it("自鯖Worker の一覧（状態で絞り込み）・無効化（切断を通知）・有効化", async () => {
    const user = await owner()
    const someone = await createTestUser(h.db, { username: "someone" })
    const worker = await createTestWorker(h.db, { ownerUserId: someone.id, name: "home" })

    const list = (await call(h, "GET", "/api/admin/private-workers", { user })).data()
    expect(list).toMatchObject({
      items: [{ id: worker.publicId, owner: { name: "someone" }, enabled: true, connections: 0 }],
      nextCursor: null,
    })

    const subscriber = h.redis.duplicate()
    const messages: string[] = []
    await subscriber.subscribe(redisKeys.invalidation())
    subscriber.on("message", (_c, m: string) => messages.push(m))

    expect(
      (await call(h, "PATCH", `/api/admin/workers/${worker.publicId}`, { user, body: { enabled: false } })).data(),
    ).toMatchObject({
      enabled: false,
      status: "offline",
    })
    expect((await call(h, "GET", "/api/admin/private-workers?status=disabled", { user })).data()).toMatchObject({
      items: [{ id: worker.publicId }],
    })
    await call(h, "PATCH", `/api/admin/workers/${worker.publicId}`, { user, body: { enabled: true, name: "renamed" } })
    await call(h, "POST", `/api/admin/workers/${worker.publicId}/disconnect`, { user })

    await new Promise((r) => setTimeout(r, 50))
    expect(messages.filter((m) => m.includes(worker.publicId)).length).toBeGreaterThanOrEqual(3)
    subscriber.disconnect()
    const actions = (
      await h.db.auditLog.findMany({ where: { targetId: worker.publicId }, orderBy: { id: "asc" } })
    ).map((l) => l.action)
    expect(actions).toEqual([
      "admin.worker.disable",
      "admin.worker.rename",
      "admin.worker.enable",
      "admin.worker.disconnect",
    ])
  })

  it("自鯖Worker の接続先を運営者が変更できる（公式Worker は不可）", async () => {
    const user = await owner()
    const guild = await installGuild(h)
    const someone = await createTestUser(h.db)
    const worker = await createTestWorker(h.db, { ownerUserId: someone.id })
    const url = `/api/admin/workers/${worker.publicId}/connections`
    await call(h, "PUT", url, { user, body: { connections: [{ guildId: guild.discordGuildId, scope: "personal" }] } })
    expect((await call(h, "GET", url, { user })).data()).toEqual([
      { guildId: guild.discordGuildId, guildName: guild.name, scope: "personal" },
    ])
    expect(
      (await call(h, "PUT", url, { user, body: { connections: [{ guildId: snowflake(), scope: "server" }] } }))
        .statusCode,
    ).toBe(404)

    const official = await createTestWorker(h.db, { type: "OFFICIAL" })
    const res = await call(h, "PUT", `/api/admin/workers/${official.publicId}/connections`, {
      user,
      body: { connections: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe("サービス全体の設定", () => {
  it("取得・更新し、上限値・お知らせ・一時停止を反映する", async () => {
    const user = await owner()
    expect((await call(h, "GET", "/api/admin/system", { user })).data()).toMatchObject({
      limits: { maxWorkersPerUser: 10, dictionaryMaxEntries: 1000, maxCharactersLimit: 1000 },
      readingPaused: false,
      announcement: null,
    })
    const res = await call(h, "PATCH", "/api/admin/system", {
      user,
      body: {
        limits: { dictionaryMaxEntries: 1, maxCharactersLimit: 300 },
        newGuildDefaults: { maxCharacters: 150 },
        readingPaused: true,
        announcement: { message: "21時からメンテナンスします", level: "warning" },
      },
    })
    expect(res.data()).toMatchObject({
      limits: { dictionaryMaxEntries: 1, maxCharactersLimit: 300 },
      newGuildDefaults: { maxCharacters: 150 },
    })

    const member = await login(h)
    expect((await call(h, "GET", "/api/status", { user: member })).data()).toMatchObject({
      readingPaused: true,
      announcement: { message: "21時からメンテナンスします", level: "warning" },
    })

    // 上限値が API に反映される
    const guild = await installGuild(h)
    const manager = await login(h, [{ id: guild.discordGuildId }])
    expect((await h.deps.repos.guildSettings.getOrCreate(guild.id)).maxCharacters).toBe(150)
    const settings = `/api/guilds/${guild.discordGuildId}/settings`
    expect((await call(h, "PATCH", settings, { user: manager, body: { maxCharacters: 301 } })).statusCode).toBe(400)
    const dict = `/api/guilds/${guild.discordGuildId}/dictionary`
    expect((await call(h, "POST", dict, { user: manager, body: { word: "a", reading: "a" } })).statusCode).toBe(201)
    expect((await call(h, "POST", dict, { user: manager, body: { word: "b", reading: "b" } })).statusCode).toBe(400)

    await call(h, "PATCH", "/api/admin/system", { user, body: { announcement: null } })
    expect((await call(h, "GET", "/api/status", { user: member })).data()).toMatchObject({ announcement: null })
  })

  it("初期の最大文字数が上限を超える設定は 400", async () => {
    const user = await owner()
    const res = await call(h, "PATCH", "/api/admin/system", { user, body: { limits: { maxCharactersLimit: 100 } } })
    expect(res.statusCode).toBe(400)
  })

  it("スラッシュコマンドの再登録を Bot に指示する", async () => {
    const user = await owner()
    expect((await call(h, "POST", "/api/admin/system/register-commands", { user })).data()).toEqual({ ok: true })
    expect(h.bot.commands).toEqual([{ kind: "register-commands" }])
  })
})

describe("運営者の管理", () => {
  it("一覧（owner を含む）・追加・権限の変更・削除。owner・自分は変更できない", async () => {
    const user = await owner()
    const id = snowflake()
    expect(
      (await call(h, "POST", "/api/admin/operators", { user, body: { discordUserId: id, role: "viewer" } })).statusCode,
    ).toBe(201)
    await call(h, "PATCH", `/api/admin/operators/${id}`, { user, body: { role: "editor" } })
    expect((await call(h, "GET", "/api/admin/operators", { user })).data()).toMatchObject([
      { discordUserId: OPERATOR_ID, role: "owner", source: "env" },
      { discordUserId: id, role: "editor", source: "web", user: null },
    ])
    expect(
      (await call(h, "PATCH", `/api/admin/operators/${OPERATOR_ID}`, { user, body: { role: "viewer" } })).statusCode,
    ).toBe(403)
    expect((await call(h, "DELETE", `/api/admin/operators/${OPERATOR_ID}`, { user })).statusCode).toBe(403)

    const admin = await operatorAs("ADMIN")
    expect((await call(h, "DELETE", `/api/admin/operators/${admin.discordUserId}`, { user: admin })).statusCode).toBe(
      403,
    )
    expect(
      (await call(h, "PATCH", `/api/admin/operators/${admin.discordUserId}`, { user: admin, body: { role: "viewer" } }))
        .statusCode,
    ).toBe(403)

    expect((await call(h, "DELETE", `/api/admin/operators/${id}`, { user })).statusCode).toBe(200)
    expect((await call(h, "DELETE", `/api/admin/operators/${id}`, { user })).statusCode).toBe(404)
    expect(
      (await call(h, "POST", "/api/admin/operators", { user, body: { discordUserId: "x", role: "admin" } })).statusCode,
    ).toBe(400)
    const actions = (await h.db.auditLog.findMany({ where: { action: { startsWith: "admin.operator" } } })).map(
      (l) => l.action,
    )
    expect(actions).toEqual(["admin.operator.set", "admin.operator.set", "admin.operator.remove"])
  })

  it("参加しているがサーバー管理権限が無いユーザーは、運営者でなければ設定を変更できない", async () => {
    const guild = await installGuild(h)
    const member = await login(h, [{ id: guild.discordGuildId, permissions: NO_PERMISSIONS }])
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user: member })).statusCode).toBe(403)
  })
})
