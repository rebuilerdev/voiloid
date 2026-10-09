/**
 * WAV を Discord に流せる PCM（48kHz・ステレオ・16bit リトルエンディアン）に変換する。
 * 音声エンジンの出力は PCM の WAV なので、FFmpeg を使わずに変換する（Bot のイメージを小さくするため）。
 */
export const DISCORD_SAMPLE_RATE = 48_000

export class UnsupportedAudioError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsupportedAudioError"
  }
}

interface WavFormat {
  /** 1 = PCM（整数）, 3 = IEEE float */
  audioFormat: number
  channels: number
  sampleRate: number
  bitsPerSample: number
}

function parseWav(wav: Buffer): { format: WavFormat; data: Buffer } {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new UnsupportedAudioError("not a WAV file")
  }
  let format: WavFormat | null = null
  let offset = 12
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === "fmt " && body + 16 <= wav.length) {
      format = {
        audioFormat: wav.readUInt16LE(body),
        channels: wav.readUInt16LE(body + 2),
        sampleRate: wav.readUInt32LE(body + 4),
        bitsPerSample: wav.readUInt16LE(body + 14),
      }
      // WAVE_FORMAT_EXTENSIBLE: 実際の形式は SubFormat の先頭 2 バイト
      if (format.audioFormat === 0xfffe && body + 26 <= wav.length) format.audioFormat = wav.readUInt16LE(body + 24)
    } else if (id === "data") {
      if (!format) throw new UnsupportedAudioError("fmt chunk is missing")
      return { format, data: wav.subarray(body, Math.min(body + size, wav.length)) }
    }
    offset = body + size + (size % 2)
  }
  throw new UnsupportedAudioError("data chunk is missing")
}

/** 各フレームのサンプル（-1〜1、全チャンネルの平均）を読む */
function readMono(format: WavFormat, data: Buffer): Float32Array {
  const bytes = format.bitsPerSample / 8
  const frameSize = bytes * format.channels
  const frames = Math.floor(data.length / frameSize)
  const read =
    format.audioFormat === 1 && format.bitsPerSample === 16
      ? (o: number) => data.readInt16LE(o) / 32768
      : format.audioFormat === 1 && format.bitsPerSample === 24
        ? (o: number) => data.readIntLE(o, 3) / 8388608
        : format.audioFormat === 1 && format.bitsPerSample === 32
          ? (o: number) => data.readInt32LE(o) / 2147483648
          : format.audioFormat === 3 && format.bitsPerSample === 32
            ? (o: number) => data.readFloatLE(o)
            : null
  if (!read || format.channels < 1 || format.sampleRate <= 0) {
    throw new UnsupportedAudioError(
      `unsupported WAV format (format=${format.audioFormat}, bits=${format.bitsPerSample}, channels=${format.channels})`,
    )
  }
  const samples = new Float32Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (let ch = 0; ch < format.channels; ch++) sum += read(frame * frameSize + ch * bytes)
    samples[frame] = sum / format.channels
  }
  return samples
}

export function wavToDiscordPcm(wav: Buffer): Buffer {
  const { format, data } = parseWav(wav)
  const input = readMono(format, data)
  const ratio = format.sampleRate / DISCORD_SAMPLE_RATE
  const outputFrames = Math.floor(input.length / ratio)
  const output = Buffer.alloc(outputFrames * 4)
  for (let i = 0; i < outputFrames; i++) {
    // 線形補間でサンプリング周波数を変換する
    const position = i * ratio
    const index = Math.floor(position)
    const a = input[index] ?? 0
    const b = input[index + 1] ?? a
    const value = a + (b - a) * (position - index)
    // 16bit の入力はそのままの値になるよう 32768 倍して範囲内に収める
    const sample = Math.max(-32768, Math.min(32767, Math.round(value * 32768)))
    output.writeInt16LE(sample, i * 4)
    output.writeInt16LE(sample, i * 4 + 2)
  }
  return output
}
