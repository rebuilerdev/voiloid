import { type EventEmitter } from "node:events"

import { describe, expect, it, vi } from "vitest"

import { silentLogger } from "../../test/fakes"
import { testWav } from "../../test/wav"

const state = vi.hoisted((): { ready: boolean; reconnect: boolean; connection: unknown; player: unknown } => ({
  ready: true,
  reconnect: false,
  connection: null,
  player: null,
}))

vi.mock("@discordjs/voice", async () => {
  // vi.mock は巻き上げられるため、ここで読み込む
  const { EventEmitter } = await import("node:events")
  class Connection extends EventEmitter {
    state = { status: "ready" }
    joinConfig = {}
    subscribe = vi.fn()
    destroy = vi.fn(() => {
      this.state.status = "destroyed"
    })
  }
  class Player extends EventEmitter {
    play = vi.fn(() => setTimeout(() => this.emit("idle"), 5))
    stop = vi.fn(() => this.emit("idle"))
  }
  return {
    AudioPlayerStatus: { Idle: "idle" },
    StreamType: { Raw: "raw" },
    VoiceConnectionStatus: {
      Ready: "ready",
      Signalling: "signalling",
      Connecting: "connecting",
      Disconnected: "disconnected",
      Destroyed: "destroyed",
    },
    joinVoiceChannel: vi.fn(() => {
      state.connection = new Connection()
      return state.connection
    }),
    createAudioPlayer: vi.fn(() => {
      state.player = new Player()
      return state.player
    }),
    createAudioResource: vi.fn((input: unknown) => ({ input })),
    entersState: vi.fn((_target: unknown, status: string) => {
      if (status === "ready") return state.ready ? Promise.resolve() : Promise.reject(new Error("timeout"))
      return state.reconnect ? Promise.resolve() : Promise.reject(new Error("gone"))
    }),
  }
})

const { createVoiceConnector } = await import("./voice")

const client = { guilds: { cache: new Map([["g1", { voiceAdapterCreator: vi.fn() }]]) } }

describe("createVoiceConnector", () => {
  it("VC に接続して再生し、再生が終わったら完了する", async () => {
    const connector = createVoiceConnector(new Map([["bot1", client]]) as never, silentLogger)
    const handle = await connector.connect({ botUserId: "bot1", guildId: "g1", voiceChannelId: "vc1" })
    await handle.play(testWav())
    const player = state.player as { play: ReturnType<typeof vi.fn> }
    expect(player.play).toHaveBeenCalledTimes(1)
    handle.stop()
    handle.destroy()
    expect((state.connection as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled()
  })

  it("Bot がサーバーにいない・接続できない場合は失敗する", async () => {
    const connector = createVoiceConnector(new Map([["bot1", client]]) as never, silentLogger)
    await expect(connector.connect({ botUserId: "other", guildId: "g1", voiceChannelId: "vc1" })).rejects.toThrow(
      "not in guild",
    )
    state.ready = false
    await expect(connector.connect({ botUserId: "bot1", guildId: "g1", voiceChannelId: "vc1" })).rejects.toThrow(
      "timeout",
    )
    expect((state.connection as { destroy: ReturnType<typeof vi.fn> }).destroy).toHaveBeenCalled()
    state.ready = true
  })

  it("切断から復帰できなければ通知する（移動など一時的な切断は待つ）", async () => {
    const connector = createVoiceConnector(new Map([["bot1", client]]) as never, silentLogger)
    const handle = await connector.connect({ botUserId: "bot1", guildId: "g1", voiceChannelId: "vc1" })
    const onDisconnected = vi.fn()
    handle.onDisconnected(onDisconnected)
    const connection = state.connection as EventEmitter

    state.reconnect = true
    connection.emit("disconnected")
    await new Promise((r) => setTimeout(r, 10))
    expect(onDisconnected).not.toHaveBeenCalled()

    state.reconnect = false
    connection.emit("disconnected")
    await new Promise((r) => setTimeout(r, 10))
    expect(onDisconnected).toHaveBeenCalledTimes(1)
  })

  it("WAV でない音声は再生せずに失敗する", async () => {
    const connector = createVoiceConnector(new Map([["bot1", client]]) as never, silentLogger)
    const handle = await connector.connect({ botUserId: "bot1", guildId: "g1", voiceChannelId: "vc1" })
    await expect(handle.play(Buffer.from("not a wav"))).rejects.toThrow("not a WAV file")
  })

  it("再生エラーでも完了する", async () => {
    const connector = createVoiceConnector(new Map([["bot1", client]]) as never, silentLogger)
    const handle = await connector.connect({ botUserId: "bot1", guildId: "g1", voiceChannelId: "vc1" })
    const player = state.player as EventEmitter & { play: ReturnType<typeof vi.fn> }
    player.play.mockImplementationOnce(() => setTimeout(() => player.emit("error", new Error("decode")), 5))
    await expect(handle.play(testWav())).resolves.toBeUndefined()
  })
})
