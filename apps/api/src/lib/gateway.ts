/**
 * Worker Gateway の内部 API クライアント（声の一覧・プレビュー）。
 */
import type { Voice, VoiceSettings } from "@voiloid/shared/contracts"
import { AppError } from "@voiloid/shared"
import { INTERNAL_API_PREFIX } from "@voiloid/shared/protocol"
import { z } from "zod"

export interface GatewayClient {
  /** 公式Worker と、指定ユーザーの自鯖Worker が提供する声 */
  listVoices(userId: string): Promise<Voice[]>
  /** 声のプレビュー（WAV） */
  preview(input: { userId: string; voice: VoiceSettings; text: string }): Promise<Buffer>
}

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

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

export function createGatewayClient(options: { baseUrl: string; token: string; fetch?: typeof fetch }): GatewayClient {
  const doFetch = options.fetch ?? fetch

  async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
    let res: Response
    try {
      res = await doFetch(`${options.baseUrl}${INTERNAL_API_PREFIX}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${options.token}`,
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
      })
    } catch {
      throw new AppError("SERVICE_UNAVAILABLE", "The voice gateway is unavailable.")
    }
    if (!res.ok) {
      const body = errorSchema.safeParse(await res.json().catch(() => null))
      if (res.status === 503 || !body.success) {
        throw new AppError("SERVICE_UNAVAILABLE", "No worker is available to synthesize this voice.")
      }
      throw new AppError(res.status === 429 ? "RATE_LIMITED" : "VALIDATION_ERROR", body.data.error.message)
    }
    return res
  }

  return {
    async listVoices(userId) {
      const res = await call(`/voices?${new URLSearchParams({ userId }).toString()}`)
      return voicesSchema.parse(await res.json()).data
    },

    async preview(input) {
      const res = await call("/preview", { method: "POST", body: input, timeoutMs: 30_000 })
      return Buffer.from(await res.arrayBuffer())
    },
  }
}
