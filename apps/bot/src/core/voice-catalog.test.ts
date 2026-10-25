import { describe, expect, it, vi } from "vitest"

import { createVoiceCatalog } from "./voice-catalog"

const voice = { engine: "VOICEVOX", speakerId: "s1", speakerName: "四国めたん", styleId: "2", styleName: "ノーマル" }

describe("createVoiceCatalog", () => {
  it("ユーザーを指定して声の一覧を取得する", async () => {
    const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(Response.json({ data: [voice] })),
    )
    expect(await createVoiceCatalog({ baseUrl: "http://gw", token: "t", fetch })("u1")).toEqual([voice])
    expect(fetch.mock.calls[0]?.[0]).toMatch(/^http:\/\/gw\/.*\/voices\?userId=u1$/)
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "Bearer t" })
  })

  it("Gateway に接続できない・エラーなら SERVICE_UNAVAILABLE", async () => {
    const catalog = (response: Response | Error) =>
      createVoiceCatalog({
        baseUrl: "http://gw",
        token: "t",
        fetch: vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
      })
    await expect(catalog(new Error("down"))("u1")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    await expect(catalog(new Response("x", { status: 500 }))("u1")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    })
  })
})
