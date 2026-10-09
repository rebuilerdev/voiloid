import { describe, expect, it, vi } from "vitest"

import { createGatewayClient } from "./gateway"

const client = (response: Response | Error) =>
  createGatewayClient({
    baseUrl: "http://gw",
    token: "t",
    fetch: vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  })

const voice = { engine: "VOICEVOX" as const, speakerId: "s", styleId: "1", speed: 1, pitch: 0, intonation: 1 }

describe("createGatewayClient", () => {
  it("声の一覧を取得する", async () => {
    const data = [{ engine: "VOICEVOX", speakerId: "s", speakerName: "n", styleId: "1", styleName: "x" }]
    expect(await client(Response.json({ data })).listVoices("u")).toEqual(data)
  })

  it("プレビューの音声を返す", async () => {
    const audio = await client(new Response(Buffer.from("RIFF"))).preview({ userId: "u", voice, text: "a" })
    expect(audio.toString()).toBe("RIFF")
  })

  it("接続できない・Worker がいないときは SERVICE_UNAVAILABLE", async () => {
    await expect(client(new Error("down")).listVoices("u")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    await expect(client(new Response("x", { status: 503 })).listVoices("u")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    })
  })

  it("Gateway のエラーを引き継ぐ", async () => {
    const error = (status: number) => Response.json({ error: { code: "X", message: "bad voice" } }, { status })
    await expect(client(error(400)).preview({ userId: "u", voice, text: "a" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "bad voice",
    })
    await expect(client(error(429)).listVoices("u")).rejects.toMatchObject({ code: "RATE_LIMITED" })
  })
})
