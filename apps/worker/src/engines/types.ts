import type { EngineId } from "@voiloid/shared"
import type { EngineReport } from "@voiloid/shared/protocol"

export interface SynthesisParams {
  speakerId: string
  styleId: string
  text: string
  speed: number
  pitch: number
  intonation: number
}

/** 音声エンジンのアダプタ（HTTP API の違いを吸収する） */
export interface EngineAdapter {
  readonly id: EngineId
  /** 話者一覧とバージョン。起動していなければ失敗する */
  report(): Promise<EngineReport>
  /** WAV を返す */
  synthesize(params: SynthesisParams, signal: AbortSignal): Promise<Buffer>
}

export class EngineError extends Error {
  constructor(engine: EngineId, message: string) {
    super(`[${engine}] ${message}`)
    this.name = "EngineError"
  }
}

export async function ensureOk(engine: EngineId, res: Response, action: string): Promise<Response> {
  if (!res.ok) {
    // 本文は長いことがあるため先頭だけ
    const detail = (await res.text().catch(() => "")).slice(0, 200)
    throw new EngineError(engine, `${action} failed: ${res.status} ${detail}`)
  }
  return res
}
