import type { Voice, VoiceSettings } from "@/types/voice"

export const enginesOf = (voices: Voice[]) => [...new Set(voices.map((v) => v.engine))]

export function speakersOf(voices: Voice[], engine?: string) {
  const map = new Map<string, { speakerId: string; speakerName: string; engine: string; styles: Voice[] }>()
  for (const v of voices) {
    if (engine && v.engine !== engine) continue
    const entry = map.get(v.speakerId) ?? { speakerId: v.speakerId, speakerName: v.speakerName, engine: v.engine, styles: [] }
    entry.styles.push(v)
    map.set(v.speakerId, entry)
  }
  return [...map.values()]
}

export type Speaker = ReturnType<typeof speakersOf>[number]

export const stylesOf = (voices: Voice[], speakerId: string) => voices.filter((v) => v.speakerId === speakerId)

/** 設定値に対応する音声（話者名・スタイル名）。見つからない場合は undefined */
export const findVoice = (voices: Voice[], s: Pick<VoiceSettings, "speakerId" | "styleId">) =>
  voices.find((v) => v.speakerId === s.speakerId && v.styleId === s.styleId)

/** Engine 変更時: その Engine の先頭の話者・スタイルに合わせる */
export function withEngine(voices: Voice[], value: VoiceSettings, engine: string): VoiceSettings {
  const first = voices.find((v) => v.engine === engine)
  return { ...value, engine, speakerId: first?.speakerId ?? "", styleId: first?.styleId ?? "" }
}

/** Speaker 変更時: その話者の先頭のスタイルに合わせる */
export function withSpeaker(voices: Voice[], value: VoiceSettings, speakerId: string): VoiceSettings {
  return { ...value, speakerId, styleId: stylesOf(voices, speakerId)[0]?.styleId ?? "" }
}
