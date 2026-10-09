/**
 * FFmpeg を使わずに、変換した PCM を @discordjs/voice（@discordjs/opus）で Opus にできることを確認する。
 */
import { createAudioResource, StreamType } from "@discordjs/voice"
import { describe, expect, it } from "vitest"

import { Readable } from "node:stream"

import { testWav } from "../../test/wav"
import { wavToDiscordPcm } from "../core/pcm"

describe("Opus への変換", () => {
  it("1 秒の音声が 20ms ごとの Opus パケット（約 50 個）になる", async () => {
    const pcm = wavToDiscordPcm(testWav({ seconds: 1 }))
    const resource = createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw })
    let packets = 0
    for await (const packet of resource.playStream as AsyncIterable<Buffer>) {
      expect(packet.length).toBeGreaterThan(0)
      packets++
    }
    expect(packets).toBeGreaterThanOrEqual(49)
    expect(packets).toBeLessThanOrEqual(51)
  })
})
