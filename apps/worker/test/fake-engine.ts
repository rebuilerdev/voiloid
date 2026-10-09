/**
 * 音声エンジンの偽物（VOICEVOX 互換 API / COEIROINK v2 API）。
 */
import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"

export interface FakeEngine {
  url: string
  requests: { method: string; path: string; body: unknown }[]
  /** 次のリクエストを失敗させる */
  failNext: number | null
  /** 合成を遅らせる（ミリ秒） */
  delayMs: number
  close: () => Promise<void>
}

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Buffer[] = []
    request.on("data", (c: Buffer) => chunks.push(c))
    request.on("end", () => resolve(Buffer.concat(chunks).toString()))
  })

export async function startFakeEngine(kind: "voicevox" | "coeiroink"): Promise<FakeEngine> {
  const engine: Omit<FakeEngine, "url" | "close"> = { requests: [], failNext: null, delayMs: 0 }
  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost")
      const raw = await readBody(request)
      engine.requests.push({
        method: request.method ?? "GET",
        path: url.pathname + url.search,
        body: raw ? JSON.parse(raw) : undefined,
      })
      if (engine.failNext !== null) {
        const status = engine.failNext
        engine.failNext = null
        response.writeHead(status).end("engine error")
        return
      }
      if (engine.delayMs > 0) await new Promise((r) => setTimeout(r, engine.delayMs))
      const json = (body: unknown) =>
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))

      if (kind === "voicevox") {
        if (url.pathname === "/version") return json("0.25.2")
        if (url.pathname === "/speakers") {
          return json([
            {
              name: "ずんだもん",
              speaker_uuid: "zunda-uuid",
              styles: [
                { id: 3, name: "ノーマル", type: "talk" },
                { id: 3061, name: "歌", type: "sing" },
              ],
            },
            { name: "歌手", speaker_uuid: "singer", styles: [{ id: 99, name: "歌", type: "frame_decode" }] },
            { name: "古い話者", speaker_uuid: "legacy", styles: [{ id: 1, name: "ノーマル" }] },
          ])
        }
        if (url.pathname === "/audio_query")
          return json({ speedScale: 1, pitchScale: 0, intonationScale: 1, accent_phrases: [] })
        if (url.pathname === "/synthesis")
          return response
            .writeHead(200, { "content-type": "audio/wav" })
            .end(Buffer.from(`wav:${url.searchParams.get("speaker")}`))
      } else {
        if (url.pathname === "/v1/speakers") {
          return json([
            {
              speakerName: "つくよみちゃん",
              speakerUuid: "tsukuyomi",
              version: "2.3.4",
              styles: [{ styleId: 0, styleName: "れいせい" }],
            },
          ])
        }
        if (url.pathname === "/v1/synthesis")
          return response.writeHead(200, { "content-type": "audio/wav" }).end(Buffer.from("wav:coeiroink"))
      }
      response.writeHead(404).end()
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return Object.assign(engine, {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  })
}
