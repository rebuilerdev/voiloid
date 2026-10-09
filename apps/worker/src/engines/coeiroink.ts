/**
 * COEIROINK v2 API。
 * - 話者: GET /v1/speakers（speakerUuid と styleId）
 * - 合成: POST /v1/synthesis
 *
 * NOTE: COEIROINK の実機での確認は未実施（API 仕様に基づく実装）。導入時に実エンジンで確認すること。
 */
import { z } from "zod"

import { ensureOk, type EngineAdapter } from "./types"

const speakersSchema = z.array(
  z.object({
    speakerName: z.string(),
    speakerUuid: z.string(),
    styles: z.array(z.object({ styleId: z.number(), styleName: z.string() })),
    version: z.string().optional(),
  }),
)

export function createCoeiroinkAdapter(baseUrl: string, fetchImpl: typeof fetch = fetch): EngineAdapter {
  const base = baseUrl.replace(/\/$/, "")

  return {
    id: "COEIROINK",

    async report() {
      const res = await fetchImpl(`${base}/v1/speakers`, { signal: AbortSignal.timeout(10_000) })
      const speakers = speakersSchema.parse(await (await ensureOk("COEIROINK", res, "speakers")).json())
      return {
        engine: "COEIROINK",
        version: speakers[0]?.version,
        healthy: true,
        speakers: speakers
          .map((s) => ({
            id: s.speakerUuid,
            name: s.speakerName,
            styles: s.styles.map((st) => ({ id: String(st.styleId), name: st.styleName })),
          }))
          .filter((s) => s.styles.length > 0),
      }
    },

    async synthesize(params, signal) {
      const res = await fetchImpl(`${base}/v1/synthesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerUuid: params.speakerId,
          styleId: Number(params.styleId),
          text: params.text,
          speedScale: params.speed,
          volumeScale: 1,
          pitchScale: params.pitch,
          intonationScale: params.intonation,
          prePhonemeLength: 0.1,
          postPhonemeLength: 0.1,
          outputSamplingRate: 24000,
        }),
        signal,
      })
      return Buffer.from(await (await ensureOk("COEIROINK", res, "synthesis")).arrayBuffer())
    },
  }
}
