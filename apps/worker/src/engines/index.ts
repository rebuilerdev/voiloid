import { ENGINES, type EngineId } from "@voiloid/shared"

import { createCoeiroinkAdapter } from "./coeiroink"
import type { EngineAdapter } from "./types"
import { createVoicevoxAdapter } from "./voicevox"

export function createAdapter(id: EngineId, baseUrl: string, fetchImpl?: typeof fetch): EngineAdapter {
  switch (ENGINES[id].type) {
    case "voicevox":
      return createVoicevoxAdapter(id, baseUrl, fetchImpl)
    case "coeiroink":
      return createCoeiroinkAdapter(baseUrl, fetchImpl)
  }
}

export type { EngineAdapter, SynthesisParams } from "./types"
