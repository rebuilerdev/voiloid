/**
 * VOICEVOX ENGINE 互換 API（VOICEVOX / AivisSpeech）。
 * - 話者: GET /speakers（speaker_uuid と、読み上げ用のスタイル）
 * - 合成: POST /audio_query → POST /synthesis
 */
import type { EngineId } from "@voiloid/shared"
import { z } from "zod"

import { ensureOk, type EngineAdapter } from "./types"

const speakersSchema = z.array(
  z.object({
    name: z.string(),
    speaker_uuid: z.string(),
    styles: z.array(z.object({ id: z.number(), name: z.string(), type: z.string().optional() })),
  }),
)

/**
 * 歌唱用のスタイルの種類（読み上げに使えない）。読み上げ用は "talk"（0.26 から "streaming_talk"）だが、
 * 種類が増えても声が消えないよう、読み上げ用を列挙せずに歌唱用だけを除く
 */
const SINGING_STYLE_TYPES = new Set(["sing", "singing_teacher", "frame_decode"])

const audioQuerySchema = z.looseObject({
  speedScale: z.number(),
  pitchScale: z.number(),
  intonationScale: z.number(),
})

export function createVoicevoxAdapter(id: EngineId, baseUrl: string, fetchImpl: typeof fetch = fetch): EngineAdapter {
  const base = baseUrl.replace(/\/$/, "")

  return {
    id,

    async report() {
      const signal = AbortSignal.timeout(10_000)
      const [speakersRes, versionRes] = await Promise.all([
        fetchImpl(`${base}/speakers`, { signal }).then((r) => ensureOk(id, r, "speakers")),
        fetchImpl(`${base}/version`, { signal }).catch(() => null),
      ])
      const speakers = speakersSchema.parse(await speakersRes.json())
      const version = versionRes?.ok ? z.string().safeParse(await versionRes.json()).data : undefined
      return {
        engine: id,
        version,
        healthy: true,
        speakers: speakers
          .map((s) => ({
            id: s.speaker_uuid,
            name: s.name,
            // 歌唱用のスタイルは読み上げに使えない
            styles: s.styles
              .filter((st) => !SINGING_STYLE_TYPES.has(st.type ?? "talk"))
              .map((st) => ({ id: String(st.id), name: st.name })),
          }))
          .filter((s) => s.styles.length > 0),
      }
    },

    async synthesize(params, signal) {
      const query = new URLSearchParams({ text: params.text, speaker: params.styleId }).toString()
      const queryRes = await fetchImpl(`${base}/audio_query?${query}`, { method: "POST", signal })
      const audioQuery = audioQuerySchema.parse(await (await ensureOk(id, queryRes, "audio_query")).json())
      audioQuery.speedScale = params.speed
      audioQuery.pitchScale = params.pitch
      audioQuery.intonationScale = params.intonation

      const synthRes = await fetchImpl(
        `${base}/synthesis?${new URLSearchParams({ speaker: params.styleId }).toString()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(audioQuery),
          signal,
        },
      )
      return Buffer.from(await (await ensureOk(id, synthRes, "synthesis")).arrayBuffer())
    },
  }
}
