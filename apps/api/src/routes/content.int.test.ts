/**
 * 辞書・マイボイス・Bot プロフィール・利用量・声・状態
 */
import { createTestUser, createTestWorker } from "@voiloid/database/testing"
import { DICTIONARY_MAX_ENTRIES } from "@voiloid/shared"
import { redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { DiscordHttpError } from "../lib/discord"
import { call, createHarness, installGuild, login, NO_PERMISSIONS, type Harness } from "../../test/harness"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

async function managedGuild() {
  const guild = await installGuild(h)
  const user = await login(h, [{ id: guild.discordGuildId }])
  return { guild, user }
}

describe("辞書", () => {
  it("追加・一覧・更新・削除と監査ログ", async () => {
    const { guild, user } = await managedGuild()
    const url = `/api/guilds/${guild.discordGuildId}/dictionary`
    const created = await call(h, "POST", url, { user, body: { word: " Discord ", reading: "でぃすこーど" } })
    expect(created.statusCode).toBe(201)
    const entry = created.data() as { id: string; word: string; createdAt: string }
    expect(entry.word).toBe("Discord")

    expect((await call(h, "GET", url, { user })).data()).toEqual([entry])

    const updated = await call(h, "PATCH", `${url}/${entry.id}`, {
      user,
      body: { word: "discord", reading: "でぃすこ" },
    })
    expect(updated.data()).toMatchObject({ word: "discord", reading: "でぃすこ" })

    expect((await call(h, "DELETE", `${url}/${entry.id}`, { user })).statusCode).toBe(200)
    expect((await call(h, "DELETE", `${url}/${entry.id}`, { user })).statusCode).toBe(404)
    expect(await h.db.auditLog.count({ where: { targetType: "dictionary" } })).toBe(3)
  })

  it("同じ単語（大文字小文字違い）は 409", async () => {
    const { guild, user } = await managedGuild()
    const url = `/api/guilds/${guild.discordGuildId}/dictionary`
    await call(h, "POST", url, { user, body: { word: "VC", reading: "ぶいしー" } })
    const dup = await call(h, "POST", url, { user, body: { word: "vc", reading: "x" } })
    expect(dup.statusCode).toBe(409)
    expect(dup.errorCode()).toBe("CONFLICT")
  })

  it("他のサーバーの単語は ID を指定しても操作できない", async () => {
    const [a, b] = await Promise.all([installGuild(h), installGuild(h)])
    const user = await login(h, [{ id: a.discordGuildId }, { id: b.discordGuildId }])
    const entry = (
      await call(h, "POST", `/api/guilds/${b.discordGuildId}/dictionary`, {
        user,
        body: { word: "w", reading: "わら" },
      })
    ).data() as { id: string }
    const url = `/api/guilds/${a.discordGuildId}/dictionary/${entry.id}`
    expect((await call(h, "PATCH", url, { user, body: { word: "x", reading: "y" } })).statusCode).toBe(404)
    expect((await call(h, "DELETE", url, { user })).statusCode).toBe(404)
    expect(
      (await call(h, "DELETE", `/api/guilds/${a.discordGuildId}/dictionary/not-a-uuid`, { user })).statusCode,
    ).toBe(404)
  })

  it("登録数の上限を超えたら 400", async () => {
    const { guild, user } = await managedGuild()
    await h.db.dictionaryEntry.createMany({
      data: Array.from({ length: DICTIONARY_MAX_ENTRIES }, (_, i) => ({
        guildId: guild.id,
        word: `w${i}`,
        wordKey: `w${i}`,
        reading: "x",
      })),
    })
    const res = await call(h, "POST", `/api/guilds/${guild.discordGuildId}/dictionary`, {
      user,
      body: { word: "over", reading: "x" },
    })
    expect(res.statusCode).toBe(400)
  })

  it.each([
    ["空の単語", { word: "", reading: "x" }],
    ["長すぎる読み", { word: "a", reading: "あ".repeat(257) }],
    ["余分な項目", { word: "a", reading: "b", guildId: "x" }],
  ])("%s は 400", async (_label, body) => {
    const { guild, user } = await managedGuild()
    expect((await call(h, "POST", `/api/guilds/${guild.discordGuildId}/dictionary`, { user, body })).statusCode).toBe(
      400,
    )
  })
})

describe("マイボイス", () => {
  const voice = { engine: "AivisSpeech", speakerId: "s", styleId: "1", speed: 1.1, pitch: 0, intonation: 1 }

  it("取得・保存・解除", async () => {
    const user = await login(h)
    expect((await call(h, "GET", "/api/me", { user })).data()).toMatchObject({ id: user.discordUserId, voice: null })
    expect((await call(h, "PATCH", "/api/me", { user, body: { voice } })).data()).toMatchObject({ voice })
    expect((await call(h, "PATCH", "/api/me", { user, body: { voice: null } })).data()).toMatchObject({ voice: null })
    expect((await call(h, "PATCH", "/api/me", { user, body: { voice: { ...voice, speed: 5 } } })).statusCode).toBe(400)
  })

  it("参加しているサーバーごとに、自分のメッセージで使えるエンジンを返す（自分専用の Worker を含む）", async () => {
    const [managed, member] = await Promise.all([installGuild(h, "管理"), installGuild(h, "参加")])
    const user = await login(h, [
      { id: managed.discordGuildId, name: "管理" },
      { id: member.discordGuildId, name: "参加", permissions: NO_PERMISSIONS },
    ])
    const other = await createTestUser(h.db)
    await createTestWorker(h.db, { type: "OFFICIAL", engines: ["VOICEVOX"] })
    // 自分専用（自分）: 参加のみのサーバーで COEIROINK が使える
    await createTestWorker(h.db, {
      ownerUserId: user.id,
      engines: ["COEIROINK"],
      connections: [{ guildId: member.id, scope: "PERSONAL" }],
    })
    // 自分専用（他人）: 自分には使えない
    await createTestWorker(h.db, {
      ownerUserId: other.id,
      engines: ["AivisSpeech"],
      connections: [{ guildId: managed.id, scope: "PERSONAL" }],
    })

    expect((await call(h, "GET", "/api/me/guilds", { user })).data()).toEqual([
      { id: managed.discordGuildId, name: "管理", canManage: true, availableEngines: ["VOICEVOX"] },
      { id: member.discordGuildId, name: "参加", canManage: false, availableEngines: ["COEIROINK", "VOICEVOX"] },
    ])
  })
})

describe("Bot プロフィール", () => {
  const png = `data:image/png;base64,${Buffer.from("PNGDATA").toString("base64")}`

  it("既定のプロフィールを返す", async () => {
    const { guild, user } = await managedGuild()
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}/bot-profile`, { user })).data()).toEqual({
      nickname: null,
      avatarUrl: null,
      defaultName: "Voiloid",
      defaultAvatarUrl: "https://cdn.discordapp.com/avatars/999999999999999999/botavatar.png?size=128",
    })
  })

  it("画像を保存 → Discord に反映 → DB に確定する", async () => {
    const { guild, user } = await managedGuild()
    const res = await call(h, "PATCH", `/api/guilds/${guild.discordGuildId}/bot-profile`, {
      user,
      body: { nickname: "ずんだ", avatar: png },
    })
    expect(res.statusCode).toBe(200)
    expect(res.data()).toMatchObject({
      nickname: "ずんだ",
      avatarUrl: `https://cdn.discordapp.com/guilds/${guild.discordGuildId}/users/999999999999999999/avatars/newavatarhash.png?size=256`,
    })
    expect(h.discord.memberUpdates).toEqual([{ guildId: guild.discordGuildId, body: { nick: "ずんだ", avatar: png } }])
    const [key] = [...h.storage.objects.keys()]
    expect(key).toMatch(new RegExp(`^bot-avatars/${guild.id}/[0-9a-f-]+\\.png$`))
    expect(h.storage.objects.get(key!)?.body.toString()).toBe("PNGDATA")
    expect(await h.db.guildBotProfile.findUnique({ where: { guildId: guild.id } })).toMatchObject({
      nickname: "ずんだ",
      avatarObjectKey: key,
      discordAvatarHash: "newavatarhash",
    })
  })

  it("確定したら、サブボットへの反映を Bot に指示する（失敗した場合は指示しない）", async () => {
    const { guild, user } = await managedGuild()
    const subscriber = h.redis.duplicate()
    const commands: unknown[] = []
    await subscriber.subscribe(redisKeys.botCommands())
    subscriber.on("message", (_channel: string, raw: string) => commands.push(JSON.parse(raw)))
    try {
      const url = `/api/guilds/${guild.discordGuildId}/bot-profile`
      h.discord.failNextMemberUpdate = new DiscordHttpError(429, 30)
      await call(h, "PATCH", url, { user, body: { nickname: "失敗" } })
      await call(h, "PATCH", url, { user, body: { nickname: "ずんだ" } })
      await vi.waitFor(() => expect(commands).toHaveLength(1))
      // 失敗したリクエストの分が後から届かないこと
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(commands).toHaveLength(1)
      expect(commands[0]).toEqual({ kind: "sync-profile", id: expect.any(String), guildId: guild.discordGuildId })
    } finally {
      subscriber.disconnect()
    }
  })

  it("Discord への反映に失敗したら DB を更新せず、保存した画像を削除する", async () => {
    const { guild, user } = await managedGuild()
    h.discord.failNextMemberUpdate = new DiscordHttpError(429, 30)
    const res = await call(h, "PATCH", `/api/guilds/${guild.discordGuildId}/bot-profile`, {
      user,
      body: { nickname: "ずんだ", avatar: png },
    })
    expect(res.statusCode).toBe(429)
    expect(res.errorCode()).toBe("RATE_LIMITED")
    expect(res.headers["retry-after"]).toBe("30")
    expect(h.storage.objects.size).toBe(0)
    expect(await h.db.guildBotProfile.count()).toBe(0)
  })

  it("既定に戻す（null）と、変更なしのリクエスト", async () => {
    const { guild, user } = await managedGuild()
    const url = `/api/guilds/${guild.discordGuildId}/bot-profile`
    await call(h, "PATCH", url, { user, body: { nickname: "ずんだ", avatar: png } })
    const reset = await call(h, "PATCH", url, { user, body: { nickname: null, avatar: null } })
    expect(reset.data()).toMatchObject({ nickname: null, avatarUrl: null })
    const noop = await call(h, "PATCH", url, { user, body: {} })
    expect(noop.data()).toMatchObject({ nickname: null })
    expect(h.discord.memberUpdates).toHaveLength(2)
  })

  it("画像以外・33 文字の名前は 400、変更は 10 分に 5 回まで", async () => {
    const { guild, user } = await managedGuild()
    const url = `/api/guilds/${guild.discordGuildId}/bot-profile`
    expect((await call(h, "PATCH", url, { user, body: { avatar: "data:text/plain;base64,aGk=" } })).statusCode).toBe(
      400,
    )
    expect((await call(h, "PATCH", url, { user, body: { nickname: "あ".repeat(33) } })).statusCode).toBe(400)
    for (let i = 0; i < 5; i++) {
      expect((await call(h, "PATCH", url, { user, body: { nickname: `n${i}` } })).statusCode).toBe(200)
    }
    expect((await call(h, "PATCH", url, { user, body: { nickname: "over" } })).statusCode).toBe(429)
  })
})

describe("利用量", () => {
  it("管理しているサーバーの合計を、公式・自鯖別と日別（JST）に返す", async () => {
    const [guild, other] = await Promise.all([installGuild(h, "管理"), installGuild(h)])
    const user = await login(h, [
      { id: guild.discordGuildId, name: "管理" },
      { id: other.discordGuildId, permissions: NO_PERMISSIONS },
    ])
    h.clock.now = new Date("2026-10-09T03:00:00Z") // JST 12:00
    await h.db.usageEvent.createMany({
      data: [
        {
          guildId: guild.id,
          engineId: "VOICEVOX",
          characters: 100,
          success: true,
          workerType: "OFFICIAL",
          createdAt: new Date("2026-10-09T01:00:00Z"),
        },
        {
          guildId: guild.id,
          engineId: "VOICEVOX",
          characters: 40,
          success: true,
          workerType: "PRIVATE",
          createdAt: new Date("2026-10-07T01:00:00Z"),
        },
        // 管理していないサーバーは含めない
        {
          guildId: other.id,
          engineId: "VOICEVOX",
          characters: 999,
          success: true,
          workerType: "OFFICIAL",
          createdAt: new Date("2026-10-09T01:00:00Z"),
        },
      ],
    })

    const week = (await call(h, "GET", "/api/usage?period=7d", { user })).data() as {
      characters: number
      daily: { date: string; characters: number }[]
      byGuild: unknown[]
    }
    expect(week).toMatchObject({
      period: "7d",
      characters: 140,
      requests: 2,
      officialWorkerCharacters: 100,
      privateWorkerCharacters: 40,
      byGuild: [{ guildId: guild.discordGuildId, guildName: "管理", characters: 140, requests: 2 }],
    })
    expect(week.daily).toHaveLength(7)
    expect(week.daily.at(0)?.date).toBe("2026-10-03")
    expect(week.daily.find((d) => d.date === "2026-10-07")?.characters).toBe(40)

    const today = (await call(h, "GET", "/api/usage?period=today", { user })).data() as {
      characters: number
      daily: unknown[]
    }
    expect(today.characters).toBe(100)
    expect(today.daily).toHaveLength(1)

    const month = (await call(h, "GET", "/api/usage?period=month", { user })).data() as { daily: unknown[] }
    expect(month.daily).toHaveLength(9)
    expect(((await call(h, "GET", "/api/usage", { user })).data() as { daily: unknown[] }).daily).toHaveLength(30)
    expect((await call(h, "GET", "/api/usage?period=year", { user })).statusCode).toBe(400)
  })
})

describe("声・プレビュー・状態", () => {
  it("声の一覧とプレビュー（data URL）", async () => {
    const user = await login(h)
    expect((await call(h, "GET", "/api/voices", { user })).data()).toEqual(h.gateway.voices)
    const voice = { engine: "VOICEVOX", speakerId: "s", styleId: "3", speed: 1, pitch: 0, intonation: 1 }
    const res = await call(h, "POST", "/api/voices/preview", { user, body: { ...voice, text: "こんにちは" } })
    expect(res.data()).toEqual({ audioUrl: `data:audio/wav;base64,${Buffer.from("RIFFfake").toString("base64")}` })
    expect(h.gateway.previews).toEqual([{ userId: user.id, voice, text: "こんにちは" }])
  })

  it("Bot の稼働状態（更新が途絶えたら offline、遅延が大きければ degraded）", async () => {
    const user = await login(h)
    expect((await call(h, "GET", "/api/status", { user })).data()).toEqual({
      bot: "offline",
      gatewayLatencyMs: 0,
      announcement: null,
      readingPaused: false,
    })

    await h.redis.set(redisKeys.botHeartbeat(), JSON.stringify({ at: new Date().toISOString(), pingMs: 42.4 }))
    expect((await call(h, "GET", "/api/status", { user })).data()).toMatchObject({
      bot: "online",
      gatewayLatencyMs: 42,
    })

    await h.redis.set(redisKeys.botHeartbeat(), JSON.stringify({ at: new Date().toISOString(), pingMs: 1500 }))
    expect((await call(h, "GET", "/api/status", { user })).data()).toMatchObject({ bot: "degraded" })

    h.clock.now = new Date(Date.now() + 120_000)
    expect((await call(h, "GET", "/api/status", { user })).data()).toMatchObject({ bot: "offline" })

    await h.redis.set(redisKeys.botHeartbeat(), "not json")
    expect((await call(h, "GET", "/api/status", { user })).data()).toMatchObject({ bot: "offline" })
  })
})

describe("エラー形式・ヘルスチェック", () => {
  it("エラーは { error: { code, message, requestId } }", async () => {
    const user = await login(h)
    const res = await call(h, "GET", "/api/unknown", { user })
    expect(res.statusCode).toBe(404)
    const body = res.json<{ error: { code: string; requestId: string } }>()
    expect(body.error.code).toBe("NOT_FOUND")
    expect(body.error.requestId).toBe(res.headers["x-request-id"])
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  it("不正な JSON は 400", async () => {
    const user = await login(h)
    const res = await h.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie: user.cookie, origin: "https://console.example.com", "content-type": "application/json" },
      payload: "{bad",
    })
    expect(res.statusCode).toBe(400)
  })

  it("大きすぎる本文・未対応の Content-Type は 400", async () => {
    const user = await login(h)
    const headers = { cookie: user.cookie, origin: "https://console.example.com" }
    const large = await h.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { ...headers, "content-type": "application/json" },
      payload: JSON.stringify({ voice: "x".repeat(9 * 1024 * 1024) }),
    })
    expect(large.statusCode).toBe(400)
    const xml = await h.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { ...headers, "content-type": "application/xml" },
      payload: "<a/>",
    })
    expect(xml.statusCode).toBe(400)
  })

  it("ヘルスチェック", async () => {
    expect((await h.app.inject({ method: "GET", url: "/healthz" })).json()).toEqual({ status: "ok" })
    expect((await h.app.inject({ method: "GET", url: "/readyz" })).json()).toEqual({ status: "ok" })
  })

  it("API 全体のレート制限", async () => {
    const user = await login(h)
    await h.redis.set(redisKeys.rateLimit(`api:${user.id}:${Math.floor(Date.now() / 60_000)}`), "300")
    const res = await call(h, "GET", "/api/me", { user })
    expect(res.statusCode).toBe(429)
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0)
  })
})
