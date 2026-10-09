/**
 * WAV（RIFF / PCM）の再生時間。利用記録用。解析できなければ null。
 */
export function wavDurationMs(audio: Buffer): number | null {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    return null
  }
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= audio.length) {
    const id = audio.toString("ascii", offset, offset + 4)
    const size = audio.readUInt32LE(offset + 4)
    if (id === "fmt " && offset + 16 <= audio.length) {
      byteRate = audio.readUInt32LE(offset + 16)
    } else if (id === "data") {
      return byteRate > 0 ? Math.round((Math.min(size, audio.length - offset - 8) / byteRate) * 1000) : null
    }
    offset += 8 + size + (size % 2)
  }
  return null
}
