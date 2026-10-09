import { describe, expect, it, vi } from "vitest"

import { createSynthesizer } from "./synthesizer"

const request = { guildId: "123456789012345678", userId: null, text: "a" }
const synth = (response: Response | Error) =>
  createSynthesizer({
    baseUrl: "http://gw",
    token: "t",
    fetch: vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  })

describe("createSynthesizer", () => {
  it("WAV を返す", async () => {
    expect((await synth(new Response(Buffer.from("RIFF")))(request)).toString()).toBe("RIFF")
  })

  it("Gateway のエラーを変換する", async () => {
    await expect(synth(new Error("down"))(request)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    await expect(
      synth(Response.json({ error: { message: "no guild" } }, { status: 404 }))(request),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "no guild",
    })
    await expect(synth(new Response("x", { status: 503 }))(request)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Synthesis failed (503).",
    })
  })
})
