/**
 * Worker Gateway の内部 API で音声を合成する。
 */
import { AppError } from "@voiloid/shared"
import { INTERNAL_API_PREFIX, type InternalSynthesizeRequest } from "@voiloid/shared/protocol"

export type Synthesizer = (request: InternalSynthesizeRequest) => Promise<Buffer>

export function createSynthesizer(options: {
  baseUrl: string
  token: string
  timeoutMs?: number
  fetch?: typeof fetch
}): Synthesizer {
  const doFetch = options.fetch ?? fetch
  return async (request) => {
    let res: Response
    try {
      res = await doFetch(`${options.baseUrl}${INTERNAL_API_PREFIX}/synthesize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(options.timeoutMs ?? 40_000),
      })
    } catch {
      throw new AppError("SERVICE_UNAVAILABLE", "The voice gateway is unavailable.")
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
      throw new AppError(
        res.status === 404 ? "NOT_FOUND" : "SERVICE_UNAVAILABLE",
        body?.error?.message ?? `Synthesis failed (${res.status}).`,
      )
    }
    return Buffer.from(await res.arrayBuffer())
  }
}
