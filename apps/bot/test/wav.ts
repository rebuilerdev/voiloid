/** テスト用の WAV（PCM 16bit モノラル、正弦波） */
export function testWav(options: { sampleRate?: number; seconds?: number; frequency?: number } = {}): Buffer {
  const sampleRate = options.sampleRate ?? 24_000
  const frames = Math.round(sampleRate * (options.seconds ?? 0.1))
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * (options.frequency ?? 440) * i) / sampleRate) * 12000), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}
