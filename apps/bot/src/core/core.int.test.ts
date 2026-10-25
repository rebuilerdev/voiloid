import { createRepositories } from "@voiloid/database"
import {
  createTestDatabase,
  createTestGuild,
  createTestUser,
  resetTestDatabase,
  snowflake,
} from "@voiloid/database/testing"
import { redisKeys } from "@voiloid/shared/protocol"
import { Redis } from "ioredis"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { TEST_REDIS_URL } from "../../../../test/env"
import { FakeConnector, fakeState, silentLogger, until } from "../../test/fakes"
import { createCommands, type CommandContext } from "./commands"
import { createControlHandler } from "./control"
import { createGuildConfigStore } from "./guild-config"
import { createBotSync } from "./bot-sync"
import { createGuildSync } from "./guild-sync"
import { cleanupStaleSessions, createSessionRecorder } from "./recorder"
import { createServiceState } from "./service-state"
import { SessionManager } from "./sessions"
import { createSpeaker, groupVoices } from "./speaker"

const db = createTestDatabase()
const repos = createRepositories(db)
const redis = new Redis(TEST_REDIS_URL)

beforeEach(async () => {
  await resetTestDatabase(db)
  await redis.flushdb()
})
afterAll(async () => {
  await db.$disconnect()
  redis.disconnect()
})

function setup() {
  const connector = new FakeConnector()
  const configs = createGuildConfigStore(repos)
  const synthesized: { text: string; userId: string | null }[] = []
  const sessions = new SessionManager({
    connector,
    synthesize: (r) => {
      synthesized.push({ text: r.text, userId: r.userId })
      return Promise.resolve(Buffer.from(r.text))
    },
    recorder: createSessionRecorder(redis, repos),
    logger: silentLogger,
    maxQueue: 10,
  })
  const pickBot = vi.fn((_guildId: string, _voiceChannelId: string): string | null => "bot1")
  const { state, values } = fakeState()
  const names: Record<string, string> = { tc1: "聞き専", vc1: "雑談", tcFixed: "固定テキスト", vcFixed: "固定VC" }
  const listVoices = vi.fn((_userId: string) =>
    Promise.resolve([
      { engine: "VOICEVOX", speakerId: "s", speakerName: "四国めたん", styleId: "3", styleName: "ノーマル" },
    ]),
  )
  const commands = createCommands({
    sessions,
    configs,
    state,
    repos,
    logger: silentLogger,
    appOrigin: "https://console.example.com",
    listVoices,
    pickBot,
    channelName: (_g, id) => names[id] ?? null,
  })
  return { commands, sessions, connector, configs, synthesized, pickBot, values, listVoices }
}

async function guild() {
  return createTestGuild(db)
}

const ctx = (guildId: string, patch: Partial<CommandContext> = {}): CommandContext => ({
  guildId,
  userId: "300000000000000001",
  channelId: "tc1",
  channelName: "聞き専",
  memberVoiceChannel: { id: "vc1", name: "雑談" },
  locale: "ja",
  ...patch,
})

describe("/join /leave /skip", () => {
  it("コマンドモード: 実行者の VC に参加し、実行したチャンネルを読み上げる。状態を Redis と DB に記録する", async () => {
    const g = await guild()
    const { commands, sessions, synthesized } = setup()
    const reply = await commands.join(ctx(g.discordGuildId))
    expect(reply).toMatchObject({ tone: "success", description: "<#tc1> の発言を読み上げます。" })
    expect(sessions.byTextChannel("tc1")?.info).toMatchObject({ voiceChannelId: "vc1", botUserId: "bot1" })
    await until(() => synthesized.length === 1)
    expect(synthesized[0]).toEqual({ text: "接続しました", userId: null })

    const state = JSON.parse((await redis.hget(redisKeys.guildSessions(g.discordGuildId), "bot1"))!) as Record<
      string,
      unknown
    >
    expect(state).toMatchObject({ textChannelName: "聞き専", voiceChannelName: "雑談" })
    expect(await db.voiceSession.findFirst()).toMatchObject({
      guildId: g.id,
      startedByUserId: "300000000000000001",
      endedAt: null,
    })

    const leave = await commands.leave(ctx(g.discordGuildId))
    expect(leave).toMatchObject({ tone: "info", description: "<#vc1> から退出しました。" })
    expect(await redis.hget(redisKeys.guildSessions(g.discordGuildId), "bot1")).toBeNull()
    expect(await db.voiceSession.findFirst()).toMatchObject({ endReason: "leave_command" })
  })

  it("チャンネル固定モード: 設定された VC・テキストチャンネルを使う", async () => {
    const g = await guild()
    await db.guildSettings.create({
      data: { guildId: g.id, readingMode: "FIXED", defaultTextChannelId: "tcFixed", defaultVoiceChannelId: "vcFixed" },
    })
    const { commands, sessions } = setup()
    await commands.join(ctx(g.discordGuildId, { memberVoiceChannel: null }))
    expect(sessions.byTextChannel("tcFixed")?.info).toMatchObject({
      voiceChannelId: "vcFixed",
      voiceChannelName: "固定VC",
    })
  })

  it("参加できない場合のエラー", async () => {
    const g = await guild()
    const { commands, pickBot, connector } = setup()
    expect(await commands.join(ctx(g.discordGuildId, { memberVoiceChannel: null }))).toMatchObject({
      tone: "error",
      description: "先にボイスチャンネルに参加してください。",
    })
    pickBot.mockReturnValueOnce(null)
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("参加できる読み上げ Bot がいません")
    connector.fail = true
    expect((await commands.join(ctx(g.discordGuildId))).description).toBe("ボイスチャンネルへの接続に失敗しました。")
    expect((await commands.join(ctx(snowflake()))).tone).toBe("error")
  })

  it("読み上げの一時停止中・利用停止中のサーバー / ユーザーは参加しない", async () => {
    const g = await guild()
    const { commands, values, sessions } = setup()
    values.paused = true
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("一時停止されています")
    values.paused = false
    values.suspendedUsers.add("300000000000000001")
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("アカウントは運営者により利用停止")
    values.suspendedUsers.clear()
    await db.guild.update({ where: { id: g.id }, data: { suspendedAt: new Date(), suspendedReason: "x" } })
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("サーバーは運営者により利用停止")
    expect(sessions.size).toBe(0)
  })

  it("同じ VC・同じテキストチャンネルでは二重に読み上げない", async () => {
    const g = await guild()
    const { commands } = setup()
    await commands.join(ctx(g.discordGuildId))
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("既に <@bot1> が読み上げ中です")
    const otherVc = await commands.join(ctx(g.discordGuildId, { memberVoiceChannel: { id: "vc2", name: "別" } }))
    expect(otherVc.description).toContain("既に別のボイスチャンネルで読み上げ中です")
  })

  it("固定モードで設定されたチャンネルが見つからなければエラー", async () => {
    const g = await guild()
    await db.guildSettings.create({
      data: { guildId: g.id, readingMode: "FIXED", defaultTextChannelId: "deleted", defaultVoiceChannelId: "vcFixed" },
    })
    const { commands } = setup()
    expect((await commands.join(ctx(g.discordGuildId))).description).toContain("見つかりません")
  })

  it("/leave・/skip は読み上げ中のセッションが無ければエラー、/skip は待ちを捨てる", async () => {
    const g = await guild()
    const { commands, sessions } = setup()
    expect((await commands.leave(ctx(g.discordGuildId))).tone).toBe("error")
    expect(commands.skip(ctx(g.discordGuildId)).tone).toBe("error")
    await commands.join(ctx(g.discordGuildId))
    const session = sessions.byTextChannel("tc1")!
    // VC に居なくても、読み上げ中のテキストチャンネルからなら操作できる
    expect(commands.skip(ctx(g.discordGuildId, { memberVoiceChannel: null }))).toMatchObject({ tone: "info" })
    expect(session.pending).toBe(0)
  })
})

describe("/dict", () => {
  it("追加（上書き）・一覧・補完・削除と監査ログ", async () => {
    const g = await guild()
    const user = await createTestUser(db, { discordUserId: "300000000000000001" })
    const { commands } = setup()
    expect(await commands.dictAdd(ctx(g.discordGuildId), " w ", " わら ")).toMatchObject({
      tone: "success",
      description: "**w** → **わら**",
    })
    await commands.dictAdd(ctx(g.discordGuildId), "W", "だぶりゅー")
    expect(await db.dictionaryEntry.findMany()).toMatchObject([
      { word: "W", reading: "だぶりゅー", createdByUserId: user.id },
    ])

    expect((await commands.dictList(ctx(g.discordGuildId))).description).toBe("`W` → だぶりゅー")
    expect(await commands.dictAutocomplete(g.discordGuildId, "w")).toEqual([{ name: "W → だぶりゅー", value: "W" }])

    expect(await commands.dictRemove(ctx(g.discordGuildId), "w")).toMatchObject({ tone: "success" })
    expect((await commands.dictRemove(ctx(g.discordGuildId), "w")).tone).toBe("error")
    expect((await commands.dictList(ctx(g.discordGuildId))).description).toContain("まだ単語が登録されていません")

    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((a) => a.action)
    expect(actions).toEqual(["dictionary.create", "dictionary.update", "dictionary.delete"])
  })

  it("入力の長さ・登録数の上限を確認する", async () => {
    const g = await guild()
    const { commands, values } = setup()
    // 上限は運営コンソールの「サービス全体の設定」
    values.maxEntries = 3
    expect((await commands.dictAdd(ctx(g.discordGuildId), " ", "x")).tone).toBe("error")
    expect((await commands.dictAdd(ctx(g.discordGuildId), "a", "あ".repeat(257))).tone).toBe("error")
    await db.dictionaryEntry.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        guildId: g.id,
        word: `w${i}`,
        wordKey: `w${i}`,
        reading: "x",
      })),
    })
    expect((await commands.dictAdd(ctx(g.discordGuildId), "new", "x")).description).toContain("3 件まで")
    // 既存の単語の上書きは上限に関係なくできる
    expect((await commands.dictAdd(ctx(g.discordGuildId), "w1", "y")).tone).toBe("success")
  })

  it("利用停止中のサーバー / ユーザーは辞書を変更できない", async () => {
    const g = await guild()
    const { commands, values } = setup()
    values.suspendedUsers.add("300000000000000001")
    expect((await commands.dictAdd(ctx(g.discordGuildId), "w", "わら")).description).toContain("アカウント")
    expect((await commands.dictRemove(ctx(g.discordGuildId), "w")).description).toContain("アカウント")
    values.suspendedUsers.clear()
    await db.guild.update({ where: { id: g.id }, data: { suspendedAt: new Date(), suspendedReason: "x" } })
    expect((await commands.dictAdd(ctx(g.discordGuildId), "w", "わら")).description).toContain("サーバー")
    expect((await commands.dictAdd(ctx(snowflake()), "w", "わら")).description).toContain("読み込めませんでした")
    expect(await db.dictionaryEntry.count()).toBe(0)
  })

  it("一覧が長い場合は省略する。未登録のサーバーは補完しない", async () => {
    const g = await guild()
    await db.dictionaryEntry.createMany({
      data: Array.from({ length: 300 }, (_, i) => ({
        guildId: g.id,
        word: `word${i}`,
        wordKey: `word${i}`,
        reading: "よみかた".repeat(5),
      })),
    })
    const { commands } = setup()
    expect((await commands.dictList(ctx(g.discordGuildId))).description).toMatch(/…ほか \d+ 件/)
    expect(await commands.dictAutocomplete(snowflake(), "")).toEqual([])
    expect((await commands.dictAdd(ctx(snowflake()), "a", "b")).tone).toBe("error")
    expect((await commands.dictRemove(ctx(snowflake()), "a")).tone).toBe("error")
  })

  it("辞書の変更は次のメッセージから反映する（キャッシュの破棄）", async () => {
    const g = await guild()
    const { commands, configs } = setup()
    expect((await configs.get(g.discordGuildId))?.dictionary("w")).toBe("w")
    await commands.dictAdd(ctx(g.discordGuildId), "w", "わら")
    expect((await configs.get(g.discordGuildId))?.dictionary("w")).toBe("わら")
  })
})

describe("英語", () => {
  it("実行者の言語が英語なら英語で返信する", async () => {
    const g = await guild()
    const { commands } = setup()
    expect(await commands.join(ctx(g.discordGuildId, { locale: "en" }))).toMatchObject({
      title: "Started reading",
      description: "Reading messages in <#tc1>.",
    })
    expect((await commands.dictList(ctx(g.discordGuildId, { locale: "en" }))).description).toContain("`/dict add`")
    expect((await commands.voice(ctx(g.discordGuildId, { locale: "en" }))).description).toBe(
      "Not set. Each server's default voice is used.",
    )
    expect(
      (await commands.leave(ctx("999", { locale: "en", memberVoiceChannel: null, channelId: "x" }))).description,
    ).toBe("No voice channel is being read.")
  })
})

describe("/voice", () => {
  it("マイボイスをキャラ名で表示し（話者 ID は出さない）、未設定なら案内する", async () => {
    const g = await guild()
    const user = await createTestUser(db, { discordUserId: "300000000000000001" })
    const { commands, listVoices } = setup()
    expect((await commands.voice(ctx(g.discordGuildId))).description).toContain("未設定です")
    await db.userVoiceSettings.create({ data: { userId: user.id, engineId: "VOICEVOX", speakerId: "s", styleId: "3" } })
    const reply = await commands.voice(ctx(g.discordGuildId))
    expect(reply.description).toBe("**四国めたん（ノーマル）**")
    expect(reply.fields?.map((f) => f.value)).toEqual([
      "VOICEVOX",
      "1.00",
      "0.00",
      "1.00",
      expect.stringContaining("https://console.example.com/settings"),
    ])
    expect(listVoices).toHaveBeenCalledWith(user.id)
  })

  it("一覧に無い声・一覧を取得できない場合も ID は出さない", async () => {
    const g = await guild()
    const user = await createTestUser(db, { discordUserId: "300000000000000001" })
    await db.userVoiceSettings.create({
      data: { userId: user.id, engineId: "VOICEVOX", speakerId: "gone", styleId: "9" },
    })
    const { commands, listVoices } = setup()
    expect((await commands.voice(ctx(g.discordGuildId))).description).toBe("**VOICEVOX の声（現在利用できません）**")
    listVoices.mockRejectedValueOnce(new Error("down"))
    expect((await commands.voice(ctx(g.discordGuildId, { locale: "en" }))).description).toBe(
      "**A VOICEVOX voice (currently unavailable)**",
    )
  })
})

describe("/speaker", () => {
  const profile = { discordUserId: "300000000000000002", username: "alice", globalName: "Alice", avatar: null }
  const voices = [
    { engine: "VOICEVOX", speakerId: "s1", speakerName: "四国めたん", styleId: "2", styleName: "ノーマル" },
    { engine: "VOICEVOX", speakerId: "s1", speakerName: "四国めたん", styleId: "0", styleName: "あまあま" },
    { engine: "COEIROINK", speakerId: "c1", speakerName: "つくよみちゃん", styleId: "0", styleName: "れいせい" },
    { engine: "Unknown", speakerId: "x", speakerName: "x", styleId: "x", styleName: "x" },
  ]

  function setupSpeaker(list: () => Promise<typeof voices> = () => Promise.resolve(voices)) {
    const { state, values } = fakeState()
    const notified: string[] = []
    const listVoices = vi.fn((_userId: string) => list())
    const speaker = createSpeaker({
      repos,
      state,
      listVoices,
      notifyUser: (id) => {
        notified.push(id)
        return Promise.resolve()
      },
      logger: silentLogger,
    })
    return { speaker, notified, values, listVoices }
  }

  it("声をエンジン → 話者 → スタイルにまとめる（未知のエンジンは除く）", () => {
    expect(groupVoices(voices)).toEqual([
      {
        id: "VOICEVOX",
        speakers: [
          {
            id: "s1",
            name: "四国めたん",
            styles: [
              { id: "2", name: "ノーマル" },
              { id: "0", name: "あまあま" },
            ],
          },
        ],
      },
      { id: "COEIROINK", speakers: [{ id: "c1", name: "つくよみちゃん", styles: [{ id: "0", name: "れいせい" }] }] },
    ])
  })

  it("Web にログインしていない人も使える。声を選び、調整し、解除するたびに Gateway に知らせる", async () => {
    const { speaker, notified, listVoices } = setupSpeaker()
    const loaded = await speaker.load(profile, "ja")
    expect(loaded).toMatchObject({ ok: true, view: { voice: null } })
    const user = await repos.users.findByDiscordId(profile.discordUserId)
    expect(user?.discordGlobalName).toBe("Alice")
    expect(listVoices).toHaveBeenCalledWith(user?.id)

    const chosen = await speaker.update(
      profile,
      { kind: "voice", engine: "VOICEVOX", speakerId: "s1", styleId: "0" },
      "ja",
    )
    expect(chosen).toMatchObject({ ok: true, view: { voice: { engine: "VOICEVOX", styleId: "0", speed: 1 } } })
    await speaker.update(profile, { kind: "params", speed: 1.5, pitch: -0.1, intonation: 1.2 }, "ja")
    // 声を変えても調整値は引き継ぐ
    await speaker.update(profile, { kind: "voice", engine: "COEIROINK", speakerId: "c1", styleId: "0" }, "ja")
    expect(await speaker.current(profile.discordUserId)).toEqual({
      engine: "COEIROINK",
      speakerId: "c1",
      styleId: "0",
      speed: 1.5,
      pitch: -0.1,
      intonation: 1.2,
    })
    expect(await speaker.update(profile, { kind: "reset" }, "ja")).toMatchObject({ ok: true, view: { voice: null } })
    expect(await speaker.current(profile.discordUserId)).toBeNull()
    expect(notified).toEqual(Array(4).fill(profile.discordUserId))
  })

  it("一覧に無い声・範囲外の値・声が未設定での調整は保存しない", async () => {
    const { speaker, notified } = setupSpeaker()
    const error = { ok: false, reply: { tone: "error" } }
    expect(
      await speaker.update(profile, { kind: "voice", engine: "VOICEVOX", speakerId: "s1", styleId: "9" }, "ja"),
    ).toMatchObject(error)
    expect(await speaker.update(profile, { kind: "params", speed: 1, pitch: 0, intonation: 1 }, "ja")).toMatchObject(
      error,
    )
    await speaker.update(profile, { kind: "voice", engine: "VOICEVOX", speakerId: "s1", styleId: "2" }, "ja")
    for (const params of [
      { speed: 3, pitch: 0, intonation: 1 },
      { speed: 1, pitch: 0.5, intonation: 1 },
      { speed: Number.NaN, pitch: 0, intonation: 1 },
    ]) {
      expect(await speaker.update(profile, { kind: "params", ...params }, "ja")).toMatchObject(error)
    }
    expect((await speaker.current(profile.discordUserId))?.speed).toBe(1)
    expect(notified).toHaveLength(1)
  })

  it("エラーは指定した言語で返す", async () => {
    const { speaker } = setupSpeaker()
    expect(await speaker.update(profile, { kind: "params", speed: 1, pitch: 0, intonation: 1 }, "en")).toMatchObject({
      ok: false,
      reply: { description: "Choose a speaker first." },
    })
  })

  it("利用停止中のユーザー・Gateway の障害・声が無い場合はエラー", async () => {
    const suspended = setupSpeaker()
    suspended.values.suspendedUsers.add(profile.discordUserId)
    expect(await suspended.speaker.load(profile, "ja")).toMatchObject({
      ok: false,
      reply: { description: expect.stringContaining("利用停止") },
    })
    expect(await setupSpeaker(() => Promise.reject(new Error("down"))).speaker.load(profile, "ja")).toMatchObject({
      ok: false,
      reply: { description: expect.stringContaining("取得できませんでした") },
    })
    expect(await setupSpeaker(() => Promise.resolve([])).speaker.load(profile, "ja")).toMatchObject({
      ok: false,
      reply: { description: expect.stringContaining("Worker") },
    })
  })
})

describe("サービス全体の状態", () => {
  it("一時停止・辞書の上限・利用停止中のユーザーを読み込み、一時停止に切り替わったことを返す", async () => {
    const state = createServiceState(repos)
    expect(await state.refresh()).toEqual({ pausedNow: false })
    expect(state.readingPaused()).toBe(false)
    expect(state.dictionaryMaxEntries()).toBe(1000)

    const [operator, user] = [await createTestUser(db), await createTestUser(db)]
    await repos.users.setSuspension(user.id, { reason: "spam", byUserId: operator.id })
    await repos.system.update({ readingPaused: true, dictionaryMaxEntries: 5 })
    expect(await state.refresh()).toEqual({ pausedNow: true })
    expect(await state.refresh()).toEqual({ pausedNow: false })
    expect(state.readingPaused()).toBe(true)
    expect(state.dictionaryMaxEntries()).toBe(5)
    expect(state.isUserSuspended(user.discordUserId)).toBe(true)
  })

  it("利用停止中のサーバーの設定に印を付ける", async () => {
    const g = await guild()
    const operator = await createTestUser(db)
    await repos.guilds.setSuspension(g.id, { reason: "x", byUserId: operator.id })
    expect(await createGuildConfigStore(repos).get(g.discordGuildId)).toMatchObject({ suspended: true })
  })
})

describe("運営コンソールからの指示", () => {
  function control() {
    const base = setup()
    const leaveGuild = vi.fn((_guildId: string) => Promise.resolve(2))
    const registerCommands = vi.fn(() => Promise.resolve(5))
    const syncProfile = vi.fn((_guildId: string, _botUserId?: string) => Promise.resolve(1))
    const handle = createControlHandler({
      redis,
      sessions: base.sessions,
      leaveGuild,
      registerCommands,
      syncProfile,
      logger: silentLogger,
    })
    const result = async (id: string) =>
      JSON.parse((await redis.get(redisKeys.botCommandResult(id))) ?? "null") as unknown
    return { ...base, handle, leaveGuild, registerCommands, syncProfile, result }
  }
  const id = () => crypto.randomUUID()

  it("サーバーの読み上げを終了し、結果を書く", async () => {
    const g = await guild()
    const { handle, commands, sessions, result, pickBot } = control()
    await commands.join(ctx(g.discordGuildId))
    pickBot.mockReturnValueOnce("bot2")
    await commands.join(ctx(g.discordGuildId, { channelId: "tc2", memberVoiceChannel: { id: "vc2", name: "2" } }))
    const commandId = id()
    await handle(JSON.stringify({ kind: "stop-sessions", id: commandId, guildId: g.discordGuildId }))
    expect(sessions.size).toBe(0)
    expect(await result(commandId)).toEqual({ ok: true, message: "2 session(s) stopped" })
    expect(await redis.ttl(redisKeys.botCommandResult(commandId))).toBeGreaterThan(0)
  })

  it("退出の前に読み上げを終了する。コマンドの再登録", async () => {
    const g = await guild()
    const { handle, commands, sessions, leaveGuild, result } = control()
    await commands.join(ctx(g.discordGuildId))
    const leave = id()
    await handle(JSON.stringify({ kind: "leave-guild", id: leave, guildId: g.discordGuildId }))
    expect(sessions.size).toBe(0)
    expect(leaveGuild).toHaveBeenCalledWith(g.discordGuildId)
    expect(await result(leave)).toEqual({ ok: true, message: "2 bot(s) left" })

    const register = id()
    await handle(JSON.stringify({ kind: "register-commands", id: register }))
    expect(await result(register)).toEqual({ ok: true, message: "5 command(s) registered" })
  })

  it("プロフィールをサブボットに反映する（対象の Bot の指定も渡す）", async () => {
    const { handle, syncProfile, result } = control()
    const all = id()
    await handle(JSON.stringify({ kind: "sync-profile", id: all, guildId: "g1" }))
    expect(syncProfile).toHaveBeenCalledWith("g1", undefined)
    expect(await result(all)).toEqual({ ok: true, message: "1 bot(s) updated" })
    await handle(JSON.stringify({ kind: "sync-profile", id: id(), guildId: "g1", botUserId: "sub1" }))
    expect(syncProfile).toHaveBeenLastCalledWith("g1", "sub1")
  })

  it("失敗したら ok: false を書き、不正なメッセージは無視する", async () => {
    const { handle, registerCommands, result } = control()
    registerCommands.mockRejectedValueOnce(new Error("Missing Access"))
    const commandId = id()
    await handle(JSON.stringify({ kind: "register-commands", id: commandId }))
    expect(await result(commandId)).toEqual({ ok: false, message: "Missing Access" })

    registerCommands.mockRejectedValueOnce("boom")
    const other = id()
    await handle(JSON.stringify({ kind: "register-commands", id: other }))
    expect(await result(other)).toEqual({ ok: false, message: "Unknown error" })

    await handle("not json")
    await handle(JSON.stringify({ kind: "unknown", id: id() }))
    expect(await redis.dbsize()).toBe(2)
  })
})

describe("guild config / sync / recorder", () => {
  it("設定と辞書をキャッシュし、破棄で読み直す", async () => {
    const g = await guild()
    const configs = createGuildConfigStore(repos)
    expect(await configs.get(g.discordGuildId)).toMatchObject({
      readingMode: "command",
      readUrls: false,
      maxCharacters: 200,
    })
    await db.guildSettings.update({ where: { guildId: g.id }, data: { readUrlsMode: "READ", maxCharacters: 80 } })
    expect(await configs.get(g.discordGuildId)).toMatchObject({ readUrls: false })
    configs.invalidate(g.discordGuildId)
    expect(await configs.get(g.discordGuildId)).toMatchObject({ readUrls: true, maxCharacters: 80 })
    expect(await configs.get(snowflake())).toBeNull()
  })

  it("参加・更新・退出・起動時の一括同期", async () => {
    const sync = createGuildSync(repos, silentLogger)
    const info = (id: string, name = "サーバー") => ({
      discordGuildId: id,
      name,
      icon: null,
      ownerDiscordUserId: snowflake(),
      memberCount: 3,
    })
    const [a, b] = [snowflake(), snowflake()]
    await sync.joined(info(a))
    expect(await db.guildSettings.count()).toBe(1)
    await sync.updated(info(a, "改名"))
    await sync.syncAll([info(b)])
    const guilds = await db.guild.findMany({ orderBy: { discordGuildId: "asc" } })
    expect(guilds.map((x) => [x.name, x.botInstalled])).toEqual([
      ["改名", false],
      ["サーバー", true],
    ])
    await sync.left(b)
    expect((await repos.guilds.findByDiscordId(b))?.botInstalled).toBe(false)
  })

  it("Bot と参加しているサーバーを同期し、参加・退出を記録する", async () => {
    const sync = createBotSync(repos, silentLogger)
    const [main, sub1, sub2, g1, g2] = [snowflake(), snowflake(), snowflake(), snowflake(), snowflake()]
    const bot = (id: string, name: string, guildIds: string[]) => ({ id, name, avatar: null, guildIds })
    await sync.syncAll(bot(main, "Voiloid", [g1, g2]), [bot(sub1, "Voiloid 2", [g1]), bot(sub2, "Voiloid 3", [])])
    expect((await repos.bots.listActive()).map((b) => [b.name, b.role, b.position])).toEqual([
      ["Voiloid", "MAIN", 0],
      ["Voiloid 2", "SUB", 1],
      ["Voiloid 3", "SUB", 2],
    ])
    await sync.joined(sub2, g2)
    await sync.left(sub1, g1)
    const members = await repos.bots.membersByGuild([g1, g2])
    expect(members.get(g1)).toEqual(new Set([main]))
    expect(members.get(g2)).toEqual(new Set([main, sub2]))
  })

  it("起動時に前回のセッションを片付ける", async () => {
    const g = await guild()
    await redis.hset(redisKeys.guildSessions(g.discordGuildId), "bot1", "{}", "other-bot", "{}")
    await db.voiceSession.create({
      data: { guildId: g.id, botUserId: "bot1", textChannelId: "t", voiceChannelId: "v" },
    })
    await cleanupStaleSessions(redis, repos, ["bot1"])
    expect(await redis.hkeys(redisKeys.guildSessions(g.discordGuildId))).toEqual(["other-bot"])
    expect(await db.voiceSession.findFirst()).toMatchObject({ endReason: "restart" })
  })

  it("未登録のサーバーのセッションは履歴を残さない", async () => {
    const recorder = createSessionRecorder(redis, repos)
    const id = await recorder.started(
      {
        guildId: snowflake(),
        botUserId: "b",
        textChannelId: "t",
        textChannelName: "t",
        voiceChannelId: "v",
        voiceChannelName: "v",
        startedAt: new Date(),
      },
      null,
    )
    expect(id).toBeNull()
  })
})
