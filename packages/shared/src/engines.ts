/**
 * 対応する音声エンジン。ID は API・DB・Worker で共通の識別子として使う。
 * type は Worker 側のアダプタ（HTTP API の互換性）を表す。
 */
export const ENGINES = {
  VOICEVOX: { type: "voicevox", defaultPort: 50021 },
  AivisSpeech: { type: "voicevox", defaultPort: 10101 },
  COEIROINK: { type: "coeiroink", defaultPort: 50032 },
} as const

export type EngineId = keyof typeof ENGINES

export type EngineType = (typeof ENGINES)[EngineId]["type"]

export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[]

export function isEngineId(value: string): value is EngineId {
  return Object.hasOwn(ENGINES, value)
}
