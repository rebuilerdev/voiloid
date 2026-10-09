import { describe, expect, it } from "vitest"

import { wavDurationMs } from "./wav"

/** PCM 16bit モノラルの WAV */
function wav(sampleRate: number, samples: number, extraChunk = false) {
  const data = Buffer.alloc(samples * 2)
  const chunks: Buffer[] = []
  const fmt = Buffer.alloc(24)
  fmt.write("fmt ", 0)
  fmt.writeUInt32LE(16, 4)
  fmt.writeUInt16LE(1, 8)
  fmt.writeUInt16LE(1, 10)
  fmt.writeUInt32LE(sampleRate, 12)
  fmt.writeUInt32LE(sampleRate * 2, 16)
  fmt.writeUInt16LE(2, 20)
  fmt.writeUInt16LE(16, 22)
  chunks.push(fmt)
  if (extraChunk) {
    const list = Buffer.alloc(8 + 3 + 1)
    list.write("LIST", 0)
    list.writeUInt32LE(3, 4)
    chunks.push(list)
  }
  const header = Buffer.alloc(8)
  header.write("data", 0)
  header.writeUInt32LE(data.length, 4)
  chunks.push(header, data)
  const body = Buffer.concat(chunks)
  const riff = Buffer.alloc(12)
  riff.write("RIFF", 0)
  riff.writeUInt32LE(body.length + 4, 4)
  riff.write("WAVE", 8)
  return Buffer.concat([riff, body])
}

describe("wavDurationMs", () => {
  it("再生時間を計算する", () => {
    expect(wavDurationMs(wav(24000, 24000))).toBe(1000)
    expect(wavDurationMs(wav(48000, 12000, true))).toBe(250)
  })

  it("WAV でない・不完全なデータは null", () => {
    expect(wavDurationMs(Buffer.from("not a wav file at all, definitely not"))).toBeNull()
    expect(wavDurationMs(Buffer.alloc(10))).toBeNull()
    const noFmt = wav(24000, 10)
    noFmt.write("xxxx", 12)
    expect(wavDurationMs(noFmt)).toBeNull()
  })
})
