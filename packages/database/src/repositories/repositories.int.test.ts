import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDatabase, createTestGuild, createTestUser, resetTestDatabase, snowflake } from "../../test/helpers"
import { mapPrismaError } from "../errors"
import { createRepositories } from "./index"

const db = createTestDatabase()
const repos = createRepositories(db)

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

const voice = {
  engine: "VOICEVOX" as const,
  speakerId: "speaker",
  styleId: "3",
  speed: 1.2,
  pitch: 0.05,
  intonation: 1.1,
}

describe("userRepository", () => {
  it("Discord のプロフィールで作成し、再ログイン時に更新する", async () => {
    const discordUserId = snowflake()
    const created = await repos.users.upsertFromDiscord({
      discordUserId,
      username: "a",
      globalName: null,
      avatar: null,
    })
    const updated = await repos.users.upsertFromDiscord({
      discordUserId,
      username: "b",
      globalName: "ビー",
      avatar: "hash",
    })
    expect(updated.id).toBe(created.id)
    expect(updated).toMatchObject({ discordUsername: "b", discordGlobalName: "ビー", discordAvatar: "hash" })
    expect(await repos.users.findByDiscordId(discordUserId)).toMatchObject({ id: created.id })
    expect(await repos.users.findById(created.id)).toMatchObject({ discordUserId })
  })

  it("マイボイスを保存・解除できる", async () => {
    const user = await createTestUser(db)
    expect(await repos.users.getVoice(user.id)).toBeNull()

    await repos.users.setVoice(user.id, voice)
    expect(await repos.users.getVoice(user.id)).toEqual(voice)

    await repos.users.setVoice(user.id, { ...voice, speed: 1.5 })
    expect(await repos.users.getVoice(user.id)).toMatchObject({ speed: 1.5 })

    await repos.users.setVoice(user.id, null)
    expect(await repos.users.getVoice(user.id)).toBeNull()
    // 未設定の状態で解除しても失敗しない
    await repos.users.setVoice(user.id, null)
  })

  it("読み上げ時はサーバーごとの声をマイボイスより優先する", async () => {
    const user = await createTestUser(db)
    const [guild, other] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    await repos.users.setVoice(user.id, voice)
    await db.guildUserVoiceSettings.create({
      data: { userId: user.id, guildId: guild.id, engineId: "AivisSpeech", speakerId: "a", styleId: "1" },
    })

    expect(await repos.users.getVoiceForGuild(user.discordUserId, guild.id)).toMatchObject({ engine: "AivisSpeech" })
    expect(await repos.users.getVoiceForGuild(user.discordUserId, other.id)).toMatchObject({ engine: "VOICEVOX" })
    expect(await repos.users.getVoiceForGuild(snowflake(), guild.id)).toBeNull()
  })

  it("廃止されたエンジンの声は未設定として扱う", async () => {
    const user = await createTestUser(db)
    await db.userVoiceSettings.create({
      data: { userId: user.id, engineId: "RemovedEngine", speakerId: "s", styleId: "1" },
    })
    expect(await repos.users.getVoice(user.id)).toBeNull()
  })
})

describe("guildRepository", () => {
  const info = (discordGuildId: string, name = "サーバー") => ({
    discordGuildId,
    name,
    icon: null,
    ownerDiscordUserId: snowflake(),
    memberCount: 10,
  })

  it("Bot の参加で作成・更新し、退出で未導入にする（設定は残す）", async () => {
    const id = snowflake()
    const guild = await repos.guilds.upsertInstalled(info(id))
    await repos.guildSettings.getOrCreate(guild.id)
    await repos.guilds.upsertInstalled(info(id, "改名"))
    expect(await repos.guilds.findByDiscordId(id)).toMatchObject({ name: "改名", botInstalled: true })

    await repos.guilds.markUninstalled(id)
    expect(await repos.guilds.findByDiscordId(id)).toMatchObject({ botInstalled: false })
    expect(await db.guildSettings.count()).toBe(1)
  })

  it("起動時の同期で、参加していないサーバーを未導入にする", async () => {
    const [a, b] = [snowflake(), snowflake()]
    await repos.guilds.upsertInstalled(info(a))
    await repos.guilds.upsertInstalled(info(b))
    expect(await repos.guilds.markUninstalledExcept([a])).toBe(1)
    const guilds = await repos.guilds.findManyByDiscordIds([a, b])
    expect(Object.fromEntries(guilds.map((g) => [g.discordGuildId, g.botInstalled]))).toEqual({ [a]: true, [b]: false })
  })
})

describe("guildSettingsRepository", () => {
  it("設定が無ければ既定値で作成する", async () => {
    const guild = await createTestGuild(db)
    const settings = await repos.guildSettings.getOrCreate(guild.id)
    expect(settings).toMatchObject({ guildId: guild.id, readingMode: "COMMAND" })
    expect((await repos.guildSettings.getOrCreate(guild.id)).createdAt).toEqual(settings.createdAt)
  })

  it("undefined の項目は変更せず、null は値を消す", async () => {
    const guild = await createTestGuild(db)
    await repos.guildSettings.update(guild.id, { defaultTextChannelId: "111", autoJoin: true })
    const updated = await repos.guildSettings.update(guild.id, { defaultTextChannelId: null, maxCharacters: 50 })
    expect(updated).toMatchObject({ defaultTextChannelId: null, autoJoin: true, maxCharacters: 50 })
    expect(await repos.guildSettings.findManyByGuildIds([guild.id])).toHaveLength(1)
  })
})

describe("botProfileRepository", () => {
  it("保存・取得できる", async () => {
    const guild = await createTestGuild(db)
    const user = await createTestUser(db)
    expect(await repos.botProfiles.findByGuildId(guild.id)).toBeNull()
    await repos.botProfiles.upsert(guild.id, { nickname: "ずんだ", updatedByUserId: user.id })
    await repos.botProfiles.upsert(guild.id, { discordAvatarHash: "abc", updatedByUserId: user.id })
    expect(await repos.botProfiles.findByGuildId(guild.id)).toMatchObject({
      nickname: "ずんだ",
      discordAvatarHash: "abc",
    })
  })
})

describe("dictionaryRepository", () => {
  it("追加・一覧・更新・削除", async () => {
    const guild = await createTestGuild(db)
    const user = await createTestUser(db)
    const b = await repos.dictionary.create(guild.id, { word: "b", reading: "びー" }, user.id)
    await repos.dictionary.create(guild.id, { word: "a", reading: "えー" }, null)

    expect((await repos.dictionary.list(guild.id)).map((e) => e.word)).toEqual(["a", "b"])
    expect(await repos.dictionary.count(guild.id)).toBe(2)
    expect(await repos.dictionary.listRules(guild.id)).toHaveLength(2)

    expect(await repos.dictionary.update(guild.id, b.id, { word: "B", reading: "びーー" })).toMatchObject({ word: "B" })
    expect(await repos.dictionary.findById(guild.id, b.id)).toMatchObject({ reading: "びーー" })
    expect(await repos.dictionary.findByWord(guild.id, "ｂ")).toMatchObject({ id: b.id })

    expect(await repos.dictionary.delete(guild.id, b.id)).toBe(true)
    expect(await repos.dictionary.delete(guild.id, b.id)).toBe(false)
  })

  it("大文字小文字・全角半角だけが違う単語は重複として CONFLICT", async () => {
    const guild = await createTestGuild(db)
    await repos.dictionary.create(guild.id, { word: "VC", reading: "ぶいしー" }, null)
    const error = await repos.dictionary.create(guild.id, { word: "ｖｃ", reading: "x" }, null).catch(mapPrismaError)
    expect(error).toMatchObject({ code: "CONFLICT" })
  })

  it("更新で既存の単語と重複したら CONFLICT", async () => {
    const guild = await createTestGuild(db)
    await repos.dictionary.create(guild.id, { word: "a", reading: "x" }, null)
    const b = await repos.dictionary.create(guild.id, { word: "b", reading: "y" }, null)
    const error = await repos.dictionary.update(guild.id, b.id, { word: "A", reading: "y" }).catch(mapPrismaError)
    expect(error).toMatchObject({ code: "CONFLICT" })
  })

  it("他のサーバーの単語は参照・更新・削除できない", async () => {
    const [mine, other] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    const entry = await repos.dictionary.create(other.id, { word: "w", reading: "わら" }, null)
    expect(await repos.dictionary.findById(mine.id, entry.id)).toBeNull()
    expect(await repos.dictionary.update(mine.id, entry.id, { word: "x", reading: "x" })).toBeNull()
    expect(await repos.dictionary.delete(mine.id, entry.id)).toBe(false)
    expect(await repos.dictionary.findById(other.id, entry.id)).toMatchObject({ word: "w" })
  })

  it("Bot の /dict add は上書き、/dict remove は大文字小文字を区別しない", async () => {
    const guild = await createTestGuild(db)
    await repos.dictionary.upsertByWord(guild.id, { word: "Discord", reading: "でぃすこ" }, null)
    const updated = await repos.dictionary.upsertByWord(guild.id, { word: "discord", reading: "でぃすこーど" }, null)
    expect(updated).toMatchObject({ word: "discord", reading: "でぃすこーど" })
    expect(await repos.dictionary.count(guild.id)).toBe(1)
    expect(await repos.dictionary.deleteByWord(guild.id, "DISCORD")).toBe(true)
    expect(await repos.dictionary.deleteByWord(guild.id, "DISCORD")).toBe(false)
  })
})

describe("voiceSessionRepository", () => {
  it("開始・終了し、起動時に閉じ忘れを終了する", async () => {
    const guild = await createTestGuild(db)
    const bot = snowflake()
    const start = {
      guildId: guild.id,
      botUserId: bot,
      textChannelId: snowflake(),
      voiceChannelId: snowflake(),
      startedByUserId: null,
    }
    const first = await repos.voiceSessions.start(start)
    await repos.voiceSessions.start(start)

    await repos.voiceSessions.end(first, "leave_command")
    expect(await db.voiceSession.findUnique({ where: { id: first } })).toMatchObject({ endReason: "leave_command" })
    // 終了済みのセッションは上書きしない
    await repos.voiceSessions.end(first, "other")
    expect(await db.voiceSession.findUnique({ where: { id: first } })).toMatchObject({ endReason: "leave_command" })

    expect(await repos.voiceSessions.endOpenSessions([bot], "restart")).toBe(1)
    expect(await db.voiceSession.count({ where: { endedAt: null } })).toBe(0)
  })
})

describe("auditRepository", () => {
  it("記録し、サーバーごとに新しい順で取得する", async () => {
    const guild = await createTestGuild(db)
    await repos.audit.record({ actorUserId: null, guildId: guild.id, action: "a", targetType: "guild" })
    await repos.audit.record({
      actorUserId: null,
      guildId: guild.id,
      action: "b",
      targetType: "guild",
      metadata: { x: 1 },
    })
    const logs = await repos.audit.listForGuild(guild.id)
    expect(logs.map((l) => l.action)).toEqual(["b", "a"])
    expect(logs[0]?.metadata).toEqual({ x: 1 })
  })
})
