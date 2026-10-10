import { redisKeys } from "@voiloid/shared/protocol"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APP_ORIGIN, call, createHarness, login, type Harness } from "../../test/harness"
import { safeNext } from "./auth"

const { setup, teardown } = createHarness()
let h: Harness

beforeEach(async () => {
  h = await setup()
})
afterAll(() => teardown())

const cookieValue = (setCookie: string | string[] | undefined, name: string) => {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  return list.find((c) => c.startsWith(`${name}=`))
}

async function startLogin(next?: string) {
  const res = await h.app.inject({
    method: "GET",
    url: `/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`,
  })
  const location = new URL(res.headers.location!)
  const state = location.searchParams.get("state")!
  const stateCookie = cookieValue(res.headers["set-cookie"], "voiloid_oauth_state")!.split(";")[0]!
  return { res, location, state, stateCookie }
}

describe("GET /api/auth/login", () => {
  it("Discord の認可画面へ state 付きでリダイレクトし、state を Cookie と Redis に保存する", async () => {
    const { res, location, state, stateCookie } = await startLogin("/servers")
    expect(res.statusCode).toBe(302)
    expect(location.origin).toBe("https://discord.test")
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP_ORIGIN}/api/auth/callback`)
    expect(stateCookie).toBe(`voiloid_oauth_state=${state}`)
    expect(cookieValue(res.headers["set-cookie"], "voiloid_oauth_state")).toMatch(/HttpOnly.*Secure|Secure.*HttpOnly/)
    expect(await h.redis.get(redisKeys.oauthState(state))).toBe(JSON.stringify({ next: "/servers" }))
  })
})

describe("GET /api/auth/callback", () => {
  const discordUserId = "300000000000000001"

  beforeEach(() => {
    h.discord.codes.set("good-code", "access-token")
    h.discord.users.set("access-token", { id: discordUserId, username: "alice", global_name: "アリス", avatar: "hash" })
  })

  it("コードを交換してユーザーを作成し、セッション Cookie を発行して元のページへ戻る", async () => {
    const { state, stateCookie } = await startLogin("/servers/1")
    const res = await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: stateCookie },
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe("/servers/1")
    const session = cookieValue(res.headers["set-cookie"], "voiloid_session")!
    expect(session).toMatch(/HttpOnly/)
    expect(session).toMatch(/Secure/)
    expect(session).toMatch(/SameSite=Lax/)

    const user = await h.deps.repos.users.findByDiscordId(discordUserId)
    expect(user).toMatchObject({ discordUsername: "alice", discordGlobalName: "アリス" })
    expect(await h.db.auditLog.count({ where: { action: "auth.login" } })).toBe(1)

    // 発行された Cookie で API を使える
    const me = await call(h, "GET", "/api/me", {
      user: { cookie: session.split(";")[0]!, id: "", discordUserId, accessToken: "" },
    })
    expect(me.data()).toMatchObject({ id: discordUserId, displayName: "アリス" })
    // state は一度しか使えない
    expect(await h.redis.get(redisKeys.oauthState(state))).toBeNull()
  })

  it("Discord のトークンを Redis に平文で保存しない", async () => {
    const { state, stateCookie } = await startLogin()
    await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: stateCookie },
    })
    const keys = await h.redis.keys(redisKeys.webSession("*"))
    expect(keys).toHaveLength(1)
    const raw = await h.redis.get(keys[0]!)
    expect(raw).not.toContain("access-token")
  })

  it("state が Cookie と一致しなければログインしない（Login CSRF 対策）", async () => {
    const { state } = await startLogin()
    const res = await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: "voiloid_oauth_state=other" },
    })
    expect(res.headers.location).toBe("/login?error=state")
    expect(await h.db.user.count()).toBe(0)
  })

  it("期限切れ・使用済みの state は拒否する", async () => {
    const { state, stateCookie } = await startLogin()
    await h.redis.del(redisKeys.oauthState(state))
    const res = await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=good-code&state=${state}`,
      headers: { cookie: stateCookie },
    })
    expect(res.headers.location).toBe("/login?error=state")
  })

  it("認可をキャンセルした・コードが無効な場合はログイン画面へ戻す", async () => {
    const cancelled = await h.app.inject({ method: "GET", url: "/api/auth/callback?error=access_denied" })
    expect(cancelled.headers.location).toBe("/login?error=cancelled")

    const { state, stateCookie } = await startLogin()
    const invalid = await h.app.inject({
      method: "GET",
      url: `/api/auth/callback?code=bad&state=${state}`,
      headers: { cookie: stateCookie },
    })
    expect(invalid.headers.location).toBe("/login?error=discord")

    const missing = await h.app.inject({ method: "GET", url: "/api/auth/callback" })
    expect(missing.headers.location).toBe("/login?error=state")
  })
})

describe("safeNext（オープンリダイレクト対策）", () => {
  it.each([
    ["/servers", "/servers"],
    ["/servers?x=1", "/servers?x=1"],
    ["//evil.example.com", "/dashboard"],
    ["/\\evil.example.com", "/dashboard"],
    ["https://evil.example.com", "/dashboard"],
    ["/a\nb", "/dashboard"],
    [undefined, "/dashboard"],
    [["/a"], "/dashboard"],
    [`/${"a".repeat(600)}`, "/dashboard"],
  ])("%j → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })
})

describe("POST /api/auth/logout", () => {
  it("セッションを破棄し、Discord のトークンを失効させて /login へ 303", async () => {
    const user = await login(h)
    const res = await call(h, "POST", "/api/auth/logout", { user })
    expect(res.statusCode).toBe(303)
    expect(res.headers.location).toBe("/login")
    expect(cookieValue(res.headers["set-cookie"], "voiloid_session")).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect(h.discord.calls.revoke).toBe(1)
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(401)
  })

  it("Web のフォーム送信（application/x-www-form-urlencoded）でもログアウトできる", async () => {
    const user = await login(h)
    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: user.cookie, origin: APP_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    })
    expect(res.statusCode).toBe(303)
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(401)
  })

  it("フォーム送信を受け付けるのはログアウトだけ", async () => {
    const user = await login(h)
    const res = await h.app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie: user.cookie, origin: APP_ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      payload: "locale=en",
    })
    expect(res.statusCode).toBe(400)
  })

  it("他サイトからのログアウト要求（Origin 不一致）は拒否する", async () => {
    const user = await login(h)
    const res = await call(h, "POST", "/api/auth/logout", { user, origin: "https://evil.example.com" })
    expect(res.statusCode).toBe(403)
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(200)
  })
})

describe("GET /api/auth/session-expired", () => {
  it("Cookie を消してログイン画面へ", async () => {
    const user = await login(h)
    const res = await h.app.inject({
      method: "GET",
      url: "/api/auth/session-expired?next=/usage",
      headers: { cookie: user.cookie },
    })
    expect(res.headers.location).toBe("/login?next=%2Fusage")
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(401)
  })
})

describe("認証・CSRF", () => {
  it("未ログイン・不正なセッションは 401", async () => {
    expect((await call(h, "GET", "/api/me")).statusCode).toBe(401)
    const forged = await call(h, "GET", "/api/me", {
      user: { cookie: "voiloid_session=forged", id: "", discordUserId: "", accessToken: "" },
    })
    expect(forged.statusCode).toBe(401)
    expect(forged.errorCode()).toBe("UNAUTHORIZED")
  })

  it("状態を変えるリクエストは Origin が無い・異なる場合に 403", async () => {
    const user = await login(h)
    const body = { voice: null }
    expect((await call(h, "PATCH", "/api/me", { user, body, origin: null })).statusCode).toBe(403)
    expect((await call(h, "PATCH", "/api/me", { user, body, origin: "https://evil.example.com" })).statusCode).toBe(403)
    expect((await call(h, "PATCH", "/api/me", { user, body })).statusCode).toBe(200)
  })

  it("Discord のアクセストークンが期限切れなら更新して続行する", async () => {
    const guildId = "400000000000000001"
    const user = await login(h, [{ id: guildId }], { accessTokenExpiresAt: Date.now() - 1000 })
    const res = await call(h, "GET", "/api/guilds", { user })
    expect(res.statusCode).toBe(200)
    expect(h.discord.calls.refresh).toBe(1)
  })

  it("期限切れのトークンで同時にリクエストが来ても、更新は 1 回だけで、ログアウトされない", async () => {
    const guildId = "400000000000000002"
    const user = await login(h, [{ id: guildId }], { accessTokenExpiresAt: Date.now() - 1000 })
    const responses = await Promise.all([
      call(h, "GET", "/api/guilds", { user }),
      call(h, "GET", "/api/usage?period=month", { user }),
    ])
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200])
    expect(h.discord.calls.refresh).toBe(1)
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(200)
  })

  it("トークンを更新できなければセッションを破棄して 401", async () => {
    const user = await login(h, [], { accessTokenExpiresAt: Date.now() - 1000 })
    h.discord.refreshFails = true
    expect((await call(h, "GET", "/api/guilds", { user })).statusCode).toBe(401)
    expect((await call(h, "GET", "/api/me", { user })).statusCode).toBe(401)
  })

  it("Discord がユーザーのトークンを拒否したら 401", async () => {
    const user = await login(h)
    h.discord.userGuilds.delete(user.accessToken)
    expect((await call(h, "GET", "/api/guilds", { user })).statusCode).toBe(401)
  })
})
