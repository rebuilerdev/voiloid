import { createTestUser, createTestWorker, snowflake } from "@voiloid/database/testing"
import { redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { call, createHarness, installGuild, login, NO_PERMISSIONS, type Harness } from "../../test/harness"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

const TEXT = 0
const VOICE = 2

describe("権限（Owner / Administrator / Manage Guild）", () => {
  it.each([
    ["Owner", { owner: true, permissions: NO_PERMISSIONS }],
    ["Administrator", { permissions: String(0x8) }],
    ["Manage Guild", { permissions: String(0x20) }],
  ])("%s は管理できる", async (_label, perms) => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId, ...perms }])
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).statusCode).toBe(200)
  })

  it("参加しているが管理権限が無いサーバーは 403（設定・辞書も同様）", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId, permissions: String(0x400) }])
    for (const path of ["", "/settings", "/channels", "/dictionary", "/bot-profile"]) {
      const res = await call(h, "GET", `/api/guilds/${guild.discordGuildId}${path}`, { user })
      expect(res.statusCode, path).toBe(403)
    }
    const patch = await call(h, "PATCH", `/api/guilds/${guild.discordGuildId}/settings`, {
      user,
      body: { readUrls: true },
    })
    expect(patch.statusCode).toBe(403)
  })

  it("参加していないサーバーは存在を明かさず 404", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [])
    expect((await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).errorCode()).toBe("NOT_FOUND")
    expect((await call(h, "GET", "/api/guilds/not-a-snowflake", { user })).statusCode).toBe(404)
  })

  it("ユーザーのサーバー一覧は短時間キャッシュし、Discord を毎回呼ばない", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    await call(h, "GET", "/api/guilds", { user })
    await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })
    expect(h.discord.calls.userGuilds).toBe(1)
  })
})

describe("GET /api/guilds", () => {
  it("管理できるサーバーだけを返し、Bot 未導入のサーバーも含める", async () => {
    const installed = await installGuild(h, "導入済み")
    const notInstalled = snowflake()
    const memberOnly = await installGuild(h, "参加のみ")
    const user = await login(h, [
      { id: installed.discordGuildId, name: "導入済み" },
      { id: notInstalled, name: "未導入" },
      { id: memberOnly.discordGuildId, permissions: NO_PERMISSIONS },
    ])
    await h.redis.set(redisKeys.botHeartbeat(), JSON.stringify({ at: new Date().toISOString(), pingMs: 40 }))
    await h.redis.hset(
      redisKeys.guildSessions(installed.discordGuildId),
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

    const guilds = (await call(h, "GET", "/api/guilds", { user })).data() as Record<string, unknown>[]
    expect(guilds).toEqual([
      expect.objectContaining({
        id: installed.discordGuildId,
        name: "導入済み",
        botInstalled: true,
        botStatus: "online",
        readingStatus: "active",
        voiceName: "ずんだもん",
        memberCount: 10,
      }),
      { id: notInstalled, name: "未導入", botInstalled: false, readingEnabled: false },
    ])
  })

  it("Bot の稼働情報が無ければ offline、セッションが無ければ idle、Gateway が応答しなければ声の名前を省略する", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    h.gateway.available = false
    const [item] = (await call(h, "GET", "/api/guilds", { user })).data() as Record<string, unknown>[]
    expect(item).toMatchObject({ botStatus: "offline", readingStatus: "idle" })
    expect(item).not.toHaveProperty("voiceName")
  })
})

describe("GET /api/guilds/:guildId", () => {
  it("今日の読み上げ数・使えるエンジン・現在のセッション・担当 Worker を返す", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    const official = await createTestWorker(h.db, {
      type: "OFFICIAL",
      engines: ["VOICEVOX", "AivisSpeech"],
      name: "official-tokyo-01",
    })
    await h.db.usageEvent.createMany({
      data: [
        { guildId: guild.id, workerId: official.id, engineId: "VOICEVOX", characters: 5, success: true },
        { guildId: guild.id, engineId: "VOICEVOX", characters: 5, success: false },
        // 昨日（JST）の記録は数えない
        {
          guildId: guild.id,
          engineId: "VOICEVOX",
          characters: 5,
          success: true,
          createdAt: new Date(Date.now() - 2 * 86_400_000),
        },
      ],
    })

    const detail = (await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).data()
    expect(detail).toMatchObject({
      botInstalled: true,
      readingStatus: "idle",
      messagesReadToday: 1,
      availableEngines: ["AivisSpeech", "VOICEVOX"],
      currentWorkerName: "official-tokyo-01",
    })
  })

  it("Bot 未導入のサーバーは最小限の情報を返す", async () => {
    const id = snowflake()
    const user = await login(h, [{ id, name: "未導入" }])
    expect((await call(h, "GET", `/api/guilds/${id}`, { user })).data()).toEqual({
      id,
      name: "未導入",
      botInstalled: false,
      readingEnabled: false,
      messagesReadToday: 0,
      availableEngines: [],
      bots: [],
    })
    // 設定は Bot 導入後のみ
    expect((await call(h, "GET", `/api/guilds/${id}/settings`, { user })).statusCode).toBe(404)
  })
})

describe("Bot（メイン・サブボット）の参加状況", () => {
  const MAIN = "900000000000000001"
  const SUB1 = "900000000000000002"
  const SUB2 = "900000000000000003"

  async function setupBots(guildId: string) {
    await h.db.bot.createMany({
      data: [
        { discordUserId: MAIN, role: "MAIN", position: 0, name: "Voiloid", avatar: "mainhash" },
        { discordUserId: SUB1, role: "SUB", position: 1, name: "Voiloid 2", avatar: null },
        { discordUserId: SUB2, role: "SUB", position: 2, name: "Voiloid 3", avatar: null },
        // 設定から外したサブボットは表示しない
        { discordUserId: "900000000000000009", role: "SUB", position: 3, name: "old", active: false },
      ],
    })
    await h.db.guildBotMembership.createMany({
      data: [
        { botUserId: MAIN, discordGuildId: guildId },
        { botUserId: SUB1, discordGuildId: guildId },
        { botUserId: "900000000000000009", discordGuildId: guildId },
      ],
    })
  }

  it("詳細: Bot ごとに参加中か・アイコン・招待 URL（サブボットはコマンドなし）を返す", async () => {
    const guild = await installGuild(h)
    await setupBots(guild.discordGuildId)
    const user = await login(h, [{ id: guild.discordGuildId }])
    const detail = (await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).data() as {
      bots: { id: string; name: string; avatarUrl?: string; role: string; present: boolean; inviteUrl: string }[]
      subBots: unknown
    }
    expect(detail.bots.map((b) => [b.name, b.role, b.present])).toEqual([
      ["Voiloid", "main", true],
      ["Voiloid 2", "sub", true],
      ["Voiloid 3", "sub", false],
    ])
    expect(detail.subBots).toEqual({ present: 1, total: 2 })
    expect(detail.bots[0]?.avatarUrl).toBe(`https://cdn.discordapp.com/avatars/${MAIN}/mainhash.png?size=128`)
    expect(detail.bots[1]).not.toHaveProperty("avatarUrl")

    const main = new URL(detail.bots[0]?.inviteUrl ?? "")
    expect(main.searchParams.get("client_id")).toBe("123456789012345678")
    expect(main.searchParams.get("scope")).toBe("bot applications.commands")
    const sub = new URL(detail.bots[2]?.inviteUrl ?? "")
    expect(sub.searchParams.get("client_id")).toBe(SUB2)
    expect(sub.searchParams.get("scope")).toBe("bot")
    expect(sub.searchParams.get("guild_id")).toBe(guild.discordGuildId)
  })

  it("一覧: サブボットの参加数を返す。Bot 未導入のサーバーでは、メインは未参加として招待できる", async () => {
    const guild = await installGuild(h)
    await setupBots(guild.discordGuildId)
    const notInstalled = snowflake()
    const user = await login(h, [{ id: guild.discordGuildId }, { id: notInstalled }])
    const guilds = (await call(h, "GET", "/api/guilds", { user })).data() as Record<string, unknown>[]
    expect(guilds[0]).toMatchObject({ subBots: { present: 1, total: 2 } })
    expect(guilds[1]).not.toHaveProperty("subBots")

    const detail = (await call(h, "GET", `/api/guilds/${notInstalled}`, { user })).data() as {
      bots: { role: string; present: boolean }[]
    }
    expect(detail.bots.map((b) => [b.role, b.present])).toEqual([
      ["main", false],
      ["sub", false],
      ["sub", false],
    ])
  })

  it("サブボットが無ければ subBots を返さない", async () => {
    const guild = await installGuild(h)
    await h.db.bot.create({ data: { discordUserId: MAIN, role: "MAIN", position: 0, name: "Voiloid" } })
    const user = await login(h, [{ id: guild.discordGuildId }])
    const detail = (await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).data()
    expect(detail).toMatchObject({ bots: [expect.objectContaining({ role: "main", present: true })] })
    expect(detail).not.toHaveProperty("subBots")
  })
})

describe("GET /api/guilds/:guildId/channels", () => {
  it("テキスト・ボイスチャンネルだけを返し、短時間キャッシュする", async () => {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    h.discord.channels.set(guild.discordGuildId, [
      { id: "11", name: "雑談VC", type: VOICE, position: 1 },
      { id: "12", name: "general", type: TEXT, position: 2 },
      { id: "13", name: "カテゴリ", type: 4, position: 0 },
      { id: "14", name: "お知らせ", type: 5, position: 1 },
      { id: "15", name: "ステージ", type: 13, position: 0 },
    ])
    const url = `/api/guilds/${guild.discordGuildId}/channels`
    expect((await call(h, "GET", url, { user })).data()).toEqual([
      { id: "14", name: "お知らせ", type: "text" },
      { id: "12", name: "general", type: "text" },
      { id: "15", name: "ステージ", type: "voice" },
      { id: "11", name: "雑談VC", type: "voice" },
    ])
    await call(h, "GET", url, { user })
    expect(h.discord.calls.channels).toBe(1)
  })
})

describe("サーバー設定", () => {
  async function setupGuild() {
    const guild = await installGuild(h)
    const user = await login(h, [{ id: guild.discordGuildId }])
    h.discord.channels.set(guild.discordGuildId, [
      { id: "500000000000000001", name: "聞き専", type: TEXT, position: 0 },
      { id: "500000000000000002", name: "雑談", type: VOICE, position: 0 },
    ])
    await createTestWorker(h.db, { type: "OFFICIAL", engines: ["VOICEVOX", "AivisSpeech"] })
    const url = `/api/guilds/${guild.discordGuildId}/settings`
    return { guild, user, url }
  }

  it("既定値（読み上げはコマンドで呼び出す）", async () => {
    const { user, url } = await setupGuild()
    expect((await call(h, "GET", url, { user })).data()).toEqual({
      readingMode: "command",
      autoJoin: false,
      readUrls: false,
      maxCharacters: 200,
      longMessageBehavior: "truncate",
      workerMode: "auto",
      fallbackToOfficial: true,
      voice: {
        engine: "VOICEVOX",
        speakerId: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
        styleId: "3",
        speed: 1,
        pitch: 0,
        intonation: 1,
      },
      disabledEngines: [],
    })
  })

  it("エンジンをオフにでき、デフォルト音声のエンジンはオフにできない。オフにしたエンジンは使えるエンジンから外す", async () => {
    const { guild, user, url } = await setupGuild()
    await createTestWorker(h.db, { type: "OFFICIAL", engines: ["VOICEVOX", "AivisSpeech"] })
    const res = await call(h, "PATCH", url, { user, body: { disabledEngines: ["AivisSpeech"] } })
    expect(res.statusCode).toBe(200)
    expect(res.data()).toMatchObject({ disabledEngines: ["AivisSpeech"] })
    const detail = (await call(h, "GET", `/api/guilds/${guild.discordGuildId}`, { user })).data()
    expect(detail).toMatchObject({ availableEngines: ["VOICEVOX"] })

    const defaultVoice = await call(h, "PATCH", url, { user, body: { disabledEngines: ["VOICEVOX"] } })
    expect(defaultVoice.statusCode).toBe(400)
    // オフにしたエンジンはデフォルト音声にできない
    const voice = { engine: "AivisSpeech", speakerId: "s", styleId: "1", speed: 1, pitch: 0, intonation: 1 }
    expect((await call(h, "PATCH", url, { user, body: { voice } })).statusCode).toBe(400)
    expect(
      (await call(h, "PATCH", url, { user, body: { disabledEngines: ["AivisSpeech", "AivisSpeech"] } })).statusCode,
    ).toBe(400)
  })

  it("部分更新し、監査ログと Bot・Gateway への変更通知を行う", async () => {
    const { guild, user, url } = await setupGuild()
    const subscriber = h.redis.duplicate()
    const messages: string[] = []
    await subscriber.subscribe(redisKeys.invalidation())
    subscriber.on("message", (_channel, message: string) => messages.push(message))

    const res = await call(h, "PATCH", url, {
      user,
      body: {
        readingMode: "fixed",
        textChannelId: "500000000000000001",
        voiceChannelId: "500000000000000002",
        autoJoin: true,
        readUrls: true,
        maxCharacters: 120,
        longMessageBehavior: "skip",
        voice: { engine: "AivisSpeech", speakerId: "a", styleId: "1", speed: 1.2, pitch: 0, intonation: 1 },
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.data()).toMatchObject({
      readingMode: "fixed",
      textChannelId: "500000000000000001",
      readUrls: true,
      maxCharacters: 120,
      longMessageBehavior: "skip",
      voice: { engine: "AivisSpeech", speed: 1.2 },
    })
    expect((await call(h, "GET", url, { user })).data()).toMatchObject({ autoJoin: true })
    expect(
      await h.db.auditLog.findFirst({ where: { action: "guild.settings.update", guildId: guild.id } }),
    ).toBeTruthy()

    await new Promise((r) => setTimeout(r, 50))
    expect(messages).toContainEqual(JSON.stringify({ kind: "guild", guildId: guild.discordGuildId }))
    subscriber.disconnect()
  })

  it.each([
    ["チャンネル固定でチャンネル未指定", { readingMode: "fixed" }],
    [
      "存在しないテキストチャンネル",
      { readingMode: "fixed", textChannelId: "500000000000000009", voiceChannelId: "500000000000000002" },
    ],
    [
      "テキストチャンネルにボイスチャンネルを指定",
      { readingMode: "fixed", textChannelId: "500000000000000002", voiceChannelId: "500000000000000002" },
    ],
    ["Worker 指定モードで Worker 未指定", { workerMode: "specific" }],
    [
      "サーバーで使えないエンジン",
      { voice: { engine: "COEIROINK", speakerId: "c", styleId: "0", speed: 1, pitch: 0, intonation: 1 } },
    ],
    ["範囲外の最大文字数", { maxCharacters: 0 }],
    ["未知の項目", { unknown: true }],
    ["voice を null", { voice: null }],
  ])("%s は 400", async (_label, body) => {
    const { user, url } = await setupGuild()
    const res = await call(h, "PATCH", url, { user, body })
    expect(res.statusCode).toBe(400)
    expect(res.errorCode()).toBe("VALIDATION_ERROR")
  })

  it("Worker 指定はサーバーに共有された Worker のみ。自分専用・他サーバーの Worker は 400", async () => {
    const { guild, user, url } = await setupGuild()
    const owner = await createTestUser(h.db)
    const shared = await createTestWorker(h.db, {
      ownerUserId: owner.id,
      connections: [{ guildId: guild.id, scope: "SERVER" }],
    })
    const personal = await createTestWorker(h.db, {
      ownerUserId: owner.id,
      connections: [{ guildId: guild.id, scope: "PERSONAL" }],
    })

    const bad = await call(h, "PATCH", url, { user, body: { workerMode: "specific", workerId: personal.publicId } })
    expect(bad.statusCode).toBe(400)

    const good = await call(h, "PATCH", url, { user, body: { workerMode: "specific", workerId: shared.publicId } })
    expect(good.data()).toMatchObject({ workerMode: "specific", workerId: shared.publicId })

    const cleared = await call(h, "PATCH", url, { user, body: { workerMode: "auto", workerId: null } })
    expect(cleared.data()).toMatchObject({ workerMode: "auto" })
    expect(cleared.data()).not.toHaveProperty("workerId")
  })

  it("チャンネル固定からコマンドに戻しても、チャンネル設定は保持する", async () => {
    const { user, url } = await setupGuild()
    await call(h, "PATCH", url, {
      user,
      body: { readingMode: "fixed", textChannelId: "500000000000000001", voiceChannelId: "500000000000000002" },
    })
    const res = await call(h, "PATCH", url, { user, body: { readingMode: "command" } })
    expect(res.data()).toMatchObject({ readingMode: "command", textChannelId: "500000000000000001" })
  })
})
