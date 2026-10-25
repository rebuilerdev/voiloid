/**
 * Worker Gateway の内部 API から声の一覧を取得する（/speaker の選択肢）。
 */
import type { Voice } from "@voiloid/shared/contracts"
import { AppError } from "@voiloid/shared"
import { INTERNAL_API_PREFIX } from "@voiloid/shared/protocol"
import { z } from "zod"

/** 公式Worker と、指定ユーザー（DB の ID）の自鯖Worker が提供する声 */
export type VoiceCatalog = (userId: string) => Promise<Voice[]>

const voicesSchema = z.object({
  data: z.array(
    z.object({
      engine: z.string(),
      speakerId: z.string(),
      speakerName: z.string(),
      styleId: z.string(),
      styleName: z.string(),
    }),
  ),
})

export function createVoiceCatalog(options: { baseUrl: string; token: string; fetch?: typeof fetch }): VoiceCatalog {
  const doFetch = options.fetch ?? fetch
  return async (userId) => {
    let res: Response
    try {
      res = await doFetch(
        `${options.baseUrl}${INTERNAL_API_PREFIX}/voices?${new URLSearchParams({ userId }).toString()}`,
        { headers: { Authorization: `Bearer ${options.token}` }, signal: AbortSignal.timeout(10_000) },
      )
    } catch {
      throw new AppError("SERVICE_UNAVAILABLE", "The voice gateway is unavailable.")
    }
    if (!res.ok) throw new AppError("SERVICE_UNAVAILABLE", `Failed to list voices (${res.status}).`)
    return voicesSchema.parse(await res.json()).data
  }
}
