import { EventEmitter } from "node:events"

import { Collection, Events, MessageFlags } from "discord.js"
import { describe, expect, it, vi } from "vitest"

import { silentLogger } from "../../test/fakes"
import type { Commands } from "../core/commands"
import { SessionManager } from "../core/sessions"
import { botIdentity, channelName, createBotPool, guildInfo, registerEvents } from "./bot"
import { commandDefinitions } from "./definitions"
import { toReplyOptions } from "./embeds"
import { leaveGuild, registerCommands } from "./register"

describe("commandDefinitions", () => {
  it("コマンド名と、辞書の編集に管理権限を求める設定", () => {
    expect(commandDefinitions.map((c) => c.name)).toEqual(["join", "leave", "skip", "voice", "dict"])
    expect(commandDefinitions.find((c) => c.name === "dict")?.default_member_permissions).toBe(String(1 << 5))
  })
})

describe("registerCommands / leaveGuild", () => {
  it("開発用サーバーがあればそのサーバーに、無ければグローバルに登録する", async () => {
    const put = vi.fn((_route: string, _options: unknown) => Promise.resolve(undefined))
    const rest = { put } as never
    expect(await registerCommands(rest, "111", "222")).toBe(commandDefinitions.length)
    expect(await registerCommands(rest, "111")).toBe(commandDefinitions.length)
    expect(put.mock.calls.map((c) => c[0])).toEqual([
      "/applications/111/guilds/222/commands",
      "/applications/111/commands",
    ])
  })

  it("参加している Bot だけを退出させる", async () => {
    const leave = vi.fn(() => Promise.resolve(undefined))
    const joined = { guilds: { cache: new Map([["g1", { leave }]]) } }
    const other = { guilds: { cache: new Map() } }
    expect(await leaveGuild([joined, other, joined], "g1")).toBe(2)
    expect(leave).toHaveBeenCalledTimes(2)
  })
})

describe("toReplyOptions", () => {
  it("本人にだけ表示する返信は Ephemeral にする", () => {
    const reply = toReplyOptions({
      tone: "error",
      title: "t",
      description: "d",
      fields: [{ name: "a", value: "b" }],
      ephemeral: true,
    })
    expect(reply.flags).toBe(MessageFlags.Ephemeral)
    expect(reply.embeds?.[0]).toMatchObject({ data: { title: "t", description: "d", color: 0xed4245 } })
    expect(toReplyOptions({ tone: "success", description: "ok" }).flags).toBeUndefined()
  })
})

function fakeClient(id: string, channel: Record<string, unknown> | null) {
  return {
    isReady: () => true,
    user: { id },
    guilds: {
      cache: new Collection([
        ["g1", { id: "g1", channels: { cache: new Collection(channel ? [["vc1", channel]] : []) } }],
      ]),
    },
  }
}

describe("createBotPool", () => {
  const voiceChannel = (joinable: boolean, speak: boolean) => ({
    isVoiceBased: () => true,
    joinable,
    permissionsFor: () => ({ has: () => speak }),
  })
  const sessions = new SessionManager({
    connector: { connect: vi.fn() },
    synthesize: vi.fn(),
    recorder: { started: vi.fn(), updated: vi.fn(), ended: vi.fn() },
    logger: silentLogger,
    maxQueue: 1,
  })

  it("参加・発言できる Bot を、メインボットから順に選ぶ", () => {
    const pool = createBotPool([
      fakeClient("main", voiceChannel(false, true)),
      fakeClient("sub1", voiceChannel(true, false)),
      fakeClient("sub2", voiceChannel(true, true)),
    ] as never)
    expect(pool.pick("g1", "vc1", sessions)).toBe("sub2")
    expect(createBotPool([fakeClient("x", null)] as never).pick("g1", "vc1", sessions)).toBeNull()
  })
})

describe("guildInfo / channelName", () => {
  it("Discord のサーバー情報を DB 用に変換する", () => {
    expect(guildInfo({ id: "1", name: "n", icon: null, ownerId: "o", memberCount: 3 } as never)).toEqual({
      discordGuildId: "1",
      name: "n",
      icon: null,
      ownerDiscordUserId: "o",
      memberCount: 3,
    })
    expect(channelName(fakeClient("b", { name: "雑談" }) as never, "g1", "vc1")).toBe("雑談")
    expect(channelName(fakeClient("b", null) as never, "g1", "vc1")).toBeNull()
  })

  it("Bot の情報と参加しているサーバーを同期用に変換する", () => {
    const client = {
      user: { id: "b1", username: "Voiloid 2", avatar: "hash" },
      guilds: {
        cache: new Map([
          ["g1", {}],
          ["g2", {}],
        ]),
      },
    }
    expect(botIdentity(client as never)).toEqual({
      id: "b1",
      name: "Voiloid 2",
      avatar: "hash",
      guildIds: ["g1", "g2"],
    })
  })
})

describe("registerEvents", () => {
  function setup() {
    const main = new EventEmitter()
    const reader = {
      onMessage: vi.fn(() => Promise.resolve(true)),
      onVoiceChannelChanged: vi.fn(() => Promise.resolve()),
      forget: vi.fn(),
    }
    const commands = {
      join: vi.fn(() => Promise.resolve({ tone: "success", description: "joined" })),
      leave: vi.fn(() => Promise.resolve({ tone: "info", description: "left" })),
      skip: vi.fn(() => ({ tone: "info", description: "skipped" })),
      voice: vi.fn(() => Promise.resolve({ tone: "info", description: "voice" })),
      dictAdd: vi.fn(() => Promise.resolve({ tone: "success", description: "added" })),
      dictRemove: vi.fn(() => Promise.resolve({ tone: "success", description: "removed" })),
      dictList: vi.fn(() => Promise.resolve({ tone: "info", description: "list" })),
      dictAutocomplete: vi.fn(() => Promise.resolve([{ name: "w", value: "w" }])),
    }
    const guildSync = {
      syncAll: vi.fn(),
      joined: vi.fn(() => Promise.resolve()),
      updated: vi.fn(() => Promise.resolve()),
      left: vi.fn(() => Promise.resolve()),
    }
    const sessions = { get: vi.fn(), moved: vi.fn(() => Promise.resolve()), inGuild: vi.fn(() => []), stop: vi.fn() }
    const botSync = { syncAll: vi.fn(), joined: vi.fn(() => Promise.resolve()), left: vi.fn(() => Promise.resolve()) }
    const profileSync = { apply: vi.fn((_guildId: string, _botUserId?: string) => Promise.resolve(1)) }
    Object.assign(main, { user: { id: "bot1" } })
    const sub = Object.assign(new EventEmitter(), { user: { id: "bot2" } })
    registerEvents({
      main: main as never,
      allClients: [main, sub] as never,
      commands: commands as unknown as Commands,
      reader: reader,
      sessions: sessions as never,
      guildSync: guildSync,
      botSync,
      profileSync,
      logger: silentLogger,
    })
    return { main, sub, reader, commands, guildSync, botSync, profileSync, sessions }
  }

  function interaction(commandName: string, sub?: string) {
    return {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      inCachedGuild: () => true,
      isRepliable: () => true,
      commandName,
      guildId: "g1",
      channelId: "tc1",
      channel: { name: "聞き専" },
      user: { id: "u1" },
      member: { voice: { channel: { id: "vc1", name: "雑談" } } },
      options: { getSubcommand: () => sub, getString: (name: string) => name, getFocused: () => "" },
      deferred: false,
      replied: false,
      reply: vi.fn(() => Promise.resolve()),
      deferReply: vi.fn(() => Promise.resolve()),
      editReply: vi.fn(() => Promise.resolve()),
      followUp: vi.fn(() => Promise.resolve()),
    }
  }

  const tick = () => new Promise((r) => setTimeout(r, 0))

  it("メッセージを読み上げ処理に渡す（DM・システムメッセージは除く）", async () => {
    const { main, reader } = setup()
    const base = {
      inGuild: () => true,
      system: false,
      guildId: "g1",
      channelId: "tc1",
      author: { id: "u1", bot: false },
      cleanContent: "hi",
      attachments: { size: 1 },
    }
    main.emit(Events.MessageCreate, base)
    main.emit(Events.MessageCreate, { ...base, system: true })
    main.emit(Events.MessageCreate, { ...base, inGuild: () => false })
    await tick()
    expect(reader.onMessage).toHaveBeenCalledTimes(1)
    expect(reader.onMessage).toHaveBeenCalledWith({
      guildId: "g1",
      channelId: "tc1",
      authorId: "u1",
      authorIsBot: false,
      content: "hi",
      attachments: 1,
    })
  })

  it("VC の参加者の変化と、Bot 自身の移動を通知する", async () => {
    const { main, reader, sessions } = setup()
    const channel = (id: string) => ({
      id,
      name: id,
      guild: { id: "g1" },
      members: new Collection([
        ["h", { user: { bot: false } }],
        ["b", { user: { bot: true } }],
      ]),
    })
    sessions.get.mockReturnValue({ key: "s" })
    main.emit(
      Events.VoiceStateUpdate,
      { channelId: "vc1", channel: channel("vc1") },
      { id: "bot1", guild: { id: "g1" }, channelId: "vc2", channel: channel("vc2") },
    )
    await tick()
    expect(sessions.moved).toHaveBeenCalledWith({ key: "s" }, "vc2", "vc2")
    expect(reader.onVoiceChannelChanged).toHaveBeenCalledWith("g1", { id: "vc1", name: "vc1", humans: 1 })
    expect(reader.onVoiceChannelChanged).toHaveBeenCalledWith("g1", { id: "vc2", name: "vc2", humans: 1 })
  })

  it("サーバーの参加・更新・退出を同期する", async () => {
    const { main, guildSync, sessions } = setup()
    const guild = { id: "g1", name: "n", icon: null, ownerId: "o", memberCount: 1 }
    sessions.inGuild.mockReturnValue([{ key: "s" }] as never)
    main.emit(Events.GuildCreate, guild)
    main.emit(Events.GuildUpdate, guild, guild)
    main.emit(Events.GuildDelete, guild)
    await tick()
    expect(guildSync.joined).toHaveBeenCalled()
    expect(guildSync.updated).toHaveBeenCalled()
    expect(guildSync.left).toHaveBeenCalledWith("g1")
    expect(sessions.stop).toHaveBeenCalledWith({ key: "s" }, "guild_removed")
  })

  it("サブボットを含む各 Bot のサーバーへの参加・退出を記録する", async () => {
    const { main, sub, botSync } = setup()
    const guild = { id: "g1", name: "n", icon: null, ownerId: "o", memberCount: 1 }
    main.emit(Events.GuildCreate, guild)
    sub.emit(Events.GuildCreate, guild)
    sub.emit(Events.GuildDelete, guild)
    await tick()
    expect(botSync.joined).toHaveBeenCalledWith("bot1", "g1")
    expect(botSync.joined).toHaveBeenCalledWith("bot2", "g1")
    expect(botSync.left).toHaveBeenCalledWith("bot2", "g1")
    expect(botSync.left).not.toHaveBeenCalledWith("bot1", "g1")
  })

  it("サブボットがサーバーに参加したら、そのサブボットにだけプロフィールを反映する（失敗しても止まらない）", async () => {
    const { main, sub, profileSync } = setup()
    const guild = { id: "g1", name: "n", icon: null, ownerId: "o", memberCount: 1 }
    main.emit(Events.GuildCreate, guild)
    expect(profileSync.apply).not.toHaveBeenCalled()
    profileSync.apply.mockRejectedValueOnce(new Error("Missing Permissions"))
    sub.emit(Events.GuildCreate, guild)
    await tick()
    expect(profileSync.apply).toHaveBeenCalledWith("g1", "bot2")
  })

  it.each([
    ["join", undefined, "join"],
    ["leave", undefined, "leave"],
    ["skip", undefined, "skip"],
    ["voice", undefined, "voice"],
    ["dict", "add", "dictAdd"],
    ["dict", "remove", "dictRemove"],
    ["dict", "list", "dictList"],
  ])("/%s %s を処理して返信する", async (name, sub, handler) => {
    const { main, commands } = setup()
    const i = interaction(name, sub)
    main.emit(Events.InteractionCreate, i)
    await new Promise((r) => setTimeout(r, 10))
    expect(commands[handler as keyof typeof commands]).toHaveBeenCalled()
    expect(name === "join" ? i.editReply : i.reply).toHaveBeenCalled()
  })

  it("補完に応答し、未知のコマンド・サーバー外は無視し、失敗時はエラーを返信する", async () => {
    const { main, commands } = setup()
    const auto = { ...interaction("dict"), isAutocomplete: () => true, respond: vi.fn(() => Promise.resolve()) }
    main.emit(Events.InteractionCreate, auto)
    const unknown = interaction("unknown")
    main.emit(Events.InteractionCreate, unknown)
    const outside = { ...interaction("join"), inCachedGuild: () => false }
    main.emit(Events.InteractionCreate, outside)
    commands.leave.mockRejectedValueOnce(new Error("boom"))
    const failing = interaction("leave")
    main.emit(Events.InteractionCreate, failing)
    await new Promise((r) => setTimeout(r, 10))
    expect(auto.respond).toHaveBeenCalledWith([{ name: "w", value: "w" }])
    expect(unknown.reply).not.toHaveBeenCalled()
    expect(outside.deferReply).not.toHaveBeenCalled()
    expect(failing.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }))
  })
})
