import { compileDictionary } from "@voiloid/shared"
import { describe, expect, it, vi } from "vitest"

import { FakeConnector, fakeRecorder, fakeState, silentLogger, until } from "../../test/fakes"
import type { GuildConfig, GuildConfigStore } from "./guild-config"
import { createReader } from "./reader"
import { SessionManager } from "./sessions"

const baseConfig: GuildConfig = {
  guildId: "internal-guild",
  suspended: false,
  readingMode: "command",
  textChannelId: null,
  voiceChannelId: null,
  autoJoin: false,
  readUrls: false,
  maxCharacters: 50,
  longMessageBehavior: "truncate",
  autoLeaveDelaySeconds: 30,
  dictionary: compileDictionary([{ word: "w", reading: "わら" }]),
}

function setup(config: Partial<GuildConfig> | null = {}) {
  const connector = new FakeConnector()
  const { recorder, events } = fakeRecorder()
  const synthesized: string[] = []
  const sessions = new SessionManager({
    connector,
    synthesize: (r) => {
      synthesized.push(r.text)
      return Promise.resolve(Buffer.from(r.text))
    },
    recorder,
    logger: silentLogger,
    maxQueue: 10,
  })
  const configs = {
    get: vi.fn(() => Promise.resolve(config === null ? null : { ...baseConfig, ...config })),
    invalidate: vi.fn(),
  } as unknown as GuildConfigStore
  const timers: { callback: () => void; ms: number }[] = []
  const pickBot = vi.fn((): string | null => "bot1")
  const { state, values } = fakeState()
  const reader = createReader({
    sessions,
    configs,
    state,
    logger: silentLogger,
    pickBot,
    channelName: () => "聞き専",
    setTimer: (callback, ms) => {
      timers.push({ callback, ms })
      return timers.length as unknown as NodeJS.Timeout
    },
    clearTimer: (timer) => {
      timers.splice(Number(timer) - 1, 1, { callback: () => undefined, ms: -1 })
    },
  })
  const start = () =>
    sessions.start(
      {
        guildId: "g1",
        botUserId: "bot1",
        textChannelId: "tc1",
        textChannelName: "t",
        voiceChannelId: "vc1",
        voiceChannelName: "v",
      },
      null,
    )
  return { reader, sessions, synthesized, timers, events, pickBot, start, values }
}

const message = (patch: Record<string, unknown> = {}) => ({
  guildId: "g1",
  channelId: "tc1",
  authorId: "u1",
  authorIsBot: false,
  content: "w https://example.com",
  attachments: 0,
  ...patch,
})

describe("onMessage", () => {
  it("読み上げ中のチャンネルのメッセージを、辞書・URL 省略を適用して読み上げる", async () => {
    const { reader, start, synthesized } = setup()
    await start()
    expect(await reader.onMessage(message())).toBe(true)
    await until(() => synthesized.length === 1)
    expect(synthesized).toEqual(["わら URL省略"])
  })

  it("Bot の発言・読み上げていないチャンネル・読む内容が無いメッセージは読まない", async () => {
    const { reader, start } = setup({ longMessageBehavior: "skip", maxCharacters: 3 })
    expect(await reader.onMessage(message())).toBe(false)
    await start()
    expect(await reader.onMessage(message({ authorIsBot: true }))).toBe(false)
    expect(await reader.onMessage(message({ channelId: "other" }))).toBe(false)
    expect(await reader.onMessage(message({ content: "長すぎるメッセージ" }))).toBe(false)
    expect(await reader.onMessage(message({ content: "  " }))).toBe(false)
  })

  it("読み上げの一時停止中・利用停止中のサーバー / ユーザーの発言は読まない", async () => {
    const { reader, start, values } = setup()
    await start()
    values.suspendedUsers.add("u1")
    expect(await reader.onMessage(message())).toBe(false)
    expect(await reader.onMessage(message({ authorId: "u2" }))).toBe(true)
    values.paused = true
    expect(await reader.onMessage(message({ authorId: "u2" }))).toBe(false)

    const suspended = setup({ suspended: true })
    await suspended.start()
    expect(await suspended.reader.onMessage(message())).toBe(false)
  })

  it("設定を読み込めなければ読まない", async () => {
    const { reader, start } = setup(null)
    await start()
    expect(await reader.onMessage(message())).toBe(false)
  })
})

describe("onVoiceChannelChanged（自動退出）", () => {
  it("読み上げ中の VC から人がいなくなったら、設定した秒数の後に退出する", async () => {
    const { reader, start, timers, events } = setup({ autoLeaveDelaySeconds: 30 })
    await start()
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 0 })
    expect(timers).toHaveLength(1)
    expect(timers[0]?.ms).toBe(30_000)
    // 2 回目の通知でタイマーを重ねない
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 0 })
    expect(timers).toHaveLength(1)
    timers[0]!.callback()
    await until(() => events.includes("end:vc1:empty"))
  })

  it("退出前に人が戻ったら取り消す", async () => {
    const { reader, start, timers, sessions } = setup()
    const session = await start()
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 0 })
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 1 })
    expect(timers[0]?.ms).toBe(-1)
    reader.forget(session)
    expect(sessions.size).toBe(1)
  })
})

describe("onVoiceChannelChanged（自動参加）", () => {
  const fixed = { readingMode: "fixed" as const, autoJoin: true, textChannelId: "tc1", voiceChannelId: "vc1" }

  it("チャンネル固定 + 自動参加なら、指定 VC に人が来たら参加して「接続しました」と読む", async () => {
    const { reader, sessions, synthesized, events } = setup(fixed)
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "雑談", humans: 1 })
    expect(sessions.byTextChannel("tc1")?.info).toMatchObject({ voiceChannelName: "雑談", textChannelName: "聞き専" })
    expect(events).toEqual(["start:vc1"])
    await until(() => synthesized.length === 1)
    expect(synthesized).toEqual(["接続しました"])
  })

  it.each([
    ["コマンドモード", { ...fixed, readingMode: "command" as const }],
    ["自動参加が無効", { ...fixed, autoJoin: false }],
    ["別の VC", { ...fixed, voiceChannelId: "vc9" }],
  ])("%s なら参加しない", async (_label, config) => {
    const { reader, sessions } = setup(config)
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 1 })
    expect(sessions.size).toBe(0)
  })

  it("利用停止中のサーバー・読み上げの一時停止中は参加しない", async () => {
    const suspended = setup({ ...fixed, suspended: true })
    await suspended.reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 1 })
    expect(suspended.sessions.size).toBe(0)

    const paused = setup(fixed)
    paused.values.paused = true
    await paused.reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 1 })
    expect(paused.sessions.size).toBe(0)
  })

  it("空いている Bot が無い・接続に失敗したら参加しない", async () => {
    const { reader, sessions, pickBot } = setup(fixed)
    pickBot.mockReturnValueOnce(null)
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 1 })
    expect(sessions.size).toBe(0)
  })

  it("人がいない VC には参加しない", async () => {
    const { reader, sessions } = setup(fixed)
    await reader.onVoiceChannelChanged("g1", { id: "vc1", name: "v", humans: 0 })
    expect(sessions.size).toBe(0)
  })
})
