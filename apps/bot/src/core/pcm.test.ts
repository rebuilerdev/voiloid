import { describe, expect, it } from "vitest"

import { DISCORD_SAMPLE_RATE, UnsupportedAudioError, wavToDiscordPcm } from "./pcm"

function wav(options: {
  sampleRate: number
  channels?: number
  bits?: number
  format?: number
  samples: number[]
  extensible?: boolean
}) {
  const channels = options.channels ?? 1
  const bits = options.bits ?? 16
  const bytes = bits / 8
  const data = Buffer.alloc(options.samples.length * bytes)
  options.samples.forEach((s, i) => {
    if (options.format === 3) data.writeFloatLE(s, i * 4)
    else if (bits === 16) data.writeInt16LE(Math.round(s * 32767), i * 2)
    else if (bits === 24) data.writeIntLE(Math.round(s * 8388607), i * 3, 3)
    else data.writeInt32LE(Math.round(s * 2147483647), i * 4)
  })
  const fmtSize = options.extensible ? 40 : 16
  const fmt = Buffer.alloc(8 + fmtSize)
  fmt.write("fmt ", 0)
  fmt.writeUInt32LE(fmtSize, 4)
  fmt.writeUInt16LE(options.extensible ? 0xfffe : (options.format ?? 1), 8)
  fmt.writeUInt16LE(channels, 10)
  fmt.writeUInt32LE(options.sampleRate, 12)
  fmt.writeUInt32LE(options.sampleRate * channels * bytes, 16)
  fmt.writeUInt16LE(channels * bytes, 20)
  fmt.writeUInt16LE(bits, 22)
  if (options.extensible) fmt.writeUInt16LE(options.format ?? 1, 8 + 24)
  const list = Buffer.from("LIST\u0003\u0000\u0000\u0000abc\u0000", "latin1")
  const dataHeader = Buffer.alloc(8)
  dataHeader.write("data", 0)
  dataHeader.writeUInt32LE(data.length, 4)
  const body = Buffer.concat([fmt, list, dataHeader, data])
  const riff = Buffer.alloc(12)
  riff.write("RIFF", 0)
  riff.writeUInt32LE(body.length + 4, 4)
  riff.write("WAVE", 8)
  return Buffer.concat([riff, body])
}

/** 量子化の誤差（±1）を許して比較する */
function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(Math.abs(value - expected[i]!), `index ${i}: ${value}`).toBeLessThanOrEqual(1))
}

/** 出力の左チャンネルのサンプル */
const left = (pcm: Buffer) => Array.from({ length: pcm.length / 4 }, (_, i) => pcm.readInt16LE(i * 4))

describe("wavToDiscordPcm", () => {
  it("24kHz モノラルを 48kHz ステレオにする（線形補間）", () => {
    const pcm = wavToDiscordPcm(wav({ sampleRate: 24_000, samples: [0, 0.5, 1, 0] }))
    expect(pcm.length / 4).toBe(8)
    expectClose(left(pcm), [0, 8192, 16384, 24576, 32767, 16384, 0, 0])
    // 左右は同じ
    expect(pcm.readInt16LE(2)).toBe(pcm.readInt16LE(0))
  })

  it("16bit の入力は値を変えない", () => {
    const input = [0.1, -0.2, 0.3, -0.999]
    const source = wav({ sampleRate: 48_000, samples: input })
    const dataStart = source.length - input.length * 2
    expect(left(wavToDiscordPcm(source))).toEqual(input.map((_, i) => source.readInt16LE(dataStart + i * 2)))
  })

  it("サンプリング周波数の違う音声も再生時間を保つ", () => {
    const seconds = (rate: number) =>
      wavToDiscordPcm(wav({ sampleRate: rate, samples: new Array<number>(rate).fill(0) })).length /
      4 /
      DISCORD_SAMPLE_RATE
    expect(seconds(24_000)).toBe(1)
    expect(seconds(44_100)).toBeCloseTo(1, 3)
    expect(seconds(48_000)).toBe(1)
  })

  it("ステレオ・24bit・32bit・float・WAVE_FORMAT_EXTENSIBLE を読める", () => {
    expectClose(left(wavToDiscordPcm(wav({ sampleRate: 48_000, channels: 2, samples: [0.5, -0.5, 1, 1] }))), [0, 32767])
    expectClose(left(wavToDiscordPcm(wav({ sampleRate: 48_000, bits: 24, samples: [0.5] }))), [16384])
    expectClose(left(wavToDiscordPcm(wav({ sampleRate: 48_000, bits: 32, samples: [-0.5] }))), [-16384])
    // 範囲外の値は切り詰める
    expectClose(left(wavToDiscordPcm(wav({ sampleRate: 48_000, bits: 32, format: 3, samples: [2] }))), [32767])
    expectClose(left(wavToDiscordPcm(wav({ sampleRate: 48_000, extensible: true, samples: [0.25] }))), [8192])
  })

  it("WAV でない・未対応の形式はエラー", () => {
    expect(() => wavToDiscordPcm(Buffer.from("not wav"))).toThrow(UnsupportedAudioError)
    expect(() => wavToDiscordPcm(wav({ sampleRate: 48_000, bits: 8, samples: [] }))).toThrow(/unsupported WAV format/)
    const noData = wav({ sampleRate: 48_000, samples: [0] }).subarray(0, 12 + 24)
    expect(() => wavToDiscordPcm(noData)).toThrow(/data chunk is missing/)
    const noFmt = Buffer.concat([
      Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEdata\u0002\u0000\u0000\u0000\u0000\u0000", "latin1"),
    ])
    expect(() => wavToDiscordPcm(noFmt)).toThrow(/fmt chunk is missing/)
  })
})
