import { describe, expect, it, vi } from "vitest"

import { canManageGuild, cdn, createDiscordApi, DiscordHttpError, toAppError } from "./discord"

function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error("no response")
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })

const api = (fetch: typeof globalThis.fetch) =>
  createDiscordApi({ apiBase: "https://discord.test/api", clientId: "1", clientSecret: "s", botToken: "bot", fetch })

const guild = (id: string) => ({ id, name: id, icon: null, owner: false, permissions: "0" })

describe("canManageGuild", () => {
  it.each([
    [{ owner: true, permissions: "0" }, true],
    [{ owner: false, permissions: "8" }, true],
    [{ owner: false, permissions: "32" }, true],
    [{ owner: false, permissions: "1024" }, false],
    // 53 bit を超える権限値でも正しく判定する
    [{ owner: false, permissions: (2n ** 60n + 32n).toString() }, true],
  ])("%j → %s", (input, expected) => {
    expect(canManageGuild(input)).toBe(expected)
  })
})

describe("createDiscordApi", () => {
  it("認可 URL に必要なパラメータを含める", () => {
    const url = new URL(api(fetch).authorizeUrl("st", "https://app/cb"))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "1",
      response_type: "code",
      scope: "identify guilds",
      redirect_uri: "https://app/cb",
      state: "st",
    })
  })

  it("コード交換はフォームで送り、失効時刻を計算する", async () => {
    const { fetch, calls } = fakeFetch([
      json({ access_token: "a", refresh_token: "r", expires_in: 60, scope: "identify" }),
    ])
    const tokens = await api(fetch).exchangeCode("code", "https://app/cb")
    expect(tokens).toMatchObject({ accessToken: "a", refreshToken: "r" })
    expect(tokens.expiresAt).toBeGreaterThan(Date.now())
    expect(calls[0]?.init.body).toContain("grant_type=authorization_code")
    expect((calls[0]?.init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded")
  })

  it("トークン更新・失効", async () => {
    const { fetch, calls } = fakeFetch([
      json({ access_token: "a2", refresh_token: "r2", expires_in: 60, scope: "identify" }),
      new Response(null, { status: 200 }),
    ])
    expect((await api(fetch).refreshTokens("r")).accessToken).toBe("a2")
    await api(fetch).revokeToken("r2")
    expect(calls[1]?.url).toBe("https://discord.test/api/oauth2/token/revoke")
  })

  it("サーバー一覧は 200 件ずつ続きを取得する", async () => {
    const first = Array.from({ length: 200 }, (_, i) => guild(String(1000 + i)))
    const { fetch, calls } = fakeFetch([json(first), json([guild("5000")])])
    const guilds = await api(fetch).getCurrentUserGuilds("token")
    expect(guilds).toHaveLength(201)
    expect(calls[1]?.url).toContain("after=1199")
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer token")
  })

  it("Bot の操作は Bot トークンで行い、監査ログの理由を付ける", async () => {
    const { fetch, calls } = fakeFetch([
      json({ nick: "n", avatar: null }),
      json([]),
      json({ id: "9", username: "bot" }),
    ])
    await api(fetch).modifyCurrentMember("1", { nick: "n" })
    await api(fetch).getGuildChannels("1")
    await api(fetch).getBotUser()
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bot bot")
    expect(headers["X-Audit-Log-Reason"]).toBeTruthy()
    expect(calls[0]?.init.method).toBe("PATCH")
    expect(calls[0]?.init.body).toBe(JSON.stringify({ nick: "n" }))
  })

  it("エラー応答・通信失敗・想定外の形式は DiscordHttpError", async () => {
    const { fetch } = fakeFetch([
      json({ message: "rate" }, 429, { "retry-after": "3.5" }),
      new Error("network"),
      json({ unexpected: true }),
      json({}, 500),
    ])
    const client = api(fetch)
    await expect(client.getCurrentUser("t")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 3.5 })
    await expect(client.getCurrentUser("t")).rejects.toMatchObject({ status: 503 })
    await expect(client.getCurrentUser("t")).rejects.toMatchObject({ status: 502 })
    await expect(client.getCurrentUser("t")).rejects.toMatchObject({ status: 500, retryAfterSeconds: undefined })
  })

  it("204 No Content", async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 204 })])
    await expect(api(fetch).revokeToken("t")).resolves.toBeUndefined()
  })
})

describe("toAppError", () => {
  it.each([
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [400, "VALIDATION_ERROR"],
    [500, "SERVICE_UNAVAILABLE"],
  ])("%d → %s", (status, code) => {
    expect(toAppError(new DiscordHttpError(status)).code).toBe(code)
  })

  it("未知のエラーは SERVICE_UNAVAILABLE", () => {
    expect(toAppError(new Error("x")).code).toBe("SERVICE_UNAVAILABLE")
  })
})

describe("cdn", () => {
  it("アニメーション画像は gif", () => {
    expect(cdn.userAvatar("1", "a_hash")).toContain(".gif")
    expect(cdn.guildIcon("1", "hash")).toBe("https://cdn.discordapp.com/icons/1/hash.png?size=128")
    expect(cdn.memberAvatar("1", "2", "a_x")).toContain("/guilds/1/users/2/avatars/a_x.gif")
  })
})
