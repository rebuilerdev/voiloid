/** 利用可能な音声（Speaker × Style 単位）。仕様書 §60 */
export interface Voice {
  engine: string
  speakerId: string
  speakerName: string
  styleId: string
  styleName: string
}

/** 合成パラメータ。仕様書 §62 */
export interface VoiceSettings {
  engine: string
  speakerId: string
  styleId: string
  speed: number
  pitch: number
  intonation: number
}

export interface VoicePreviewRequest extends VoiceSettings {
  text: string
}

export interface VoicePreview {
  /** 再生可能な音声 URL（data URL を含む） */
  audioUrl: string
}

export const VOICE_PARAM_RANGE = {
  speed: { min: 0.5, max: 2, step: 0.05, default: 1 },
  pitch: { min: -0.15, max: 0.15, step: 0.01, default: 0 },
  intonation: { min: 0, max: 2, step: 0.05, default: 1 },
} as const

export type VoiceParam = keyof typeof VOICE_PARAM_RANGE
