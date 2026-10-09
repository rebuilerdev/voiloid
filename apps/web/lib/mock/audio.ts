/**
 * Voice Preview のモック音声。テキスト長に応じた長さの短いチャイム（WAV）を data URL で返す。
 */
export function createPreviewWav(text: string, pitch = 0): string {
  const sampleRate = 22050
  const seconds = Math.min(2.5, 0.5 + text.length * 0.04)
  const length = Math.floor(sampleRate * seconds)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, "RIFF")
  view.setUint32(4, 36 + length * 2, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, length * 2, true)

  const base = 440 * (1 + pitch * 2)
  const notes = [1, 1.25, 1.5, 1.25]
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const note = notes[Math.floor((t / seconds) * notes.length) % notes.length]
    const envelope = Math.min(1, t * 20) * Math.min(1, (seconds - t) * 8)
    const sample = Math.sin(2 * Math.PI * base * note * t) * 0.25 * envelope
    view.setInt16(44 + i * 2, sample * 0x7fff, true)
  }

  return `data:audio/wav;base64,${Buffer.from(buffer).toString("base64")}`
}
