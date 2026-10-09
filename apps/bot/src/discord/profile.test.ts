import { describe, expect, it, vi } from "vitest"

import { createProfileSync } from "./profile"

function sub(id: string, guildIds: string[]) {
  return {
    user: { id },
    guilds: { cache: new Map(guildIds.map((g) => [g, {}])) },
    rest: { patch: vi.fn(() => Promise.resolve({})) },
  }
}

function setup(profile: { nickname: string | null; discordAvatarHash: string | null } | null, guildExists = true) {
  const subs = [sub("sub1", ["g1"]), sub("sub2", ["g1", "g2"]), sub("sub3", ["g2"])]
  const repos = {
    guilds: { findByDiscordId: vi.fn(() => Promise.resolve(guildExists ? { id: "uuid-g1" } : null)) },
    botProfiles: { findByGuildId: vi.fn(() => Promise.resolve(profile)) },
  }
  const fetch = vi.fn((_url: string) =>
    Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })),
  )
  const sync = createProfileSync({
    repos: repos as never,
    mainUserId: "main",
    subs: subs as never,
    fetch: fetch as never,
  })
  return { sync, subs, repos, fetch }
}

describe("createProfileSync", () => {
  it("サーバーにいるサブボットに、名前とメインの Bot のアイコンを反映する", async () => {
    const { sync, subs, fetch } = setup({ nickname: "読み上げ係", discordAvatarHash: "hash" })
    expect(await sync.apply("g1")).toBe(2)
    expect(fetch).toHaveBeenCalledWith("https://cdn.discordapp.com/guilds/g1/users/main/avatars/hash.png?size=1024")
    const body = { body: { nick: "読み上げ係", avatar: "data:image/png;base64,AQID" } }
    expect(subs[0]?.rest.patch).toHaveBeenCalledWith("/guilds/g1/members/@me", body)
    expect(subs[1]?.rest.patch).toHaveBeenCalledWith("/guilds/g1/members/@me", body)
    expect(subs[2]?.rest.patch).not.toHaveBeenCalled()
  })

  it("対象の Bot を指定できる。アニメーションのアイコンは gif で取得する", async () => {
    const { sync, subs, fetch } = setup({ nickname: null, discordAvatarHash: "a_anim" })
    expect(await sync.apply("g2", "sub3")).toBe(1)
    expect(fetch.mock.calls[0]?.[0]).toContain("/avatars/a_anim.gif")
    expect(subs[1]?.rest.patch).not.toHaveBeenCalled()
    expect(subs[2]?.rest.patch).toHaveBeenCalled()
  })

  it("名前・アイコンを既定に戻した場合は null で反映する（アイコンは取得しない）", async () => {
    const { sync, subs, fetch } = setup({ nickname: null, discordAvatarHash: null })
    await sync.apply("g1", "sub1")
    expect(fetch).not.toHaveBeenCalled()
    expect(subs[0]?.rest.patch).toHaveBeenCalledWith("/guilds/g1/members/@me", { body: { nick: null, avatar: null } })
  })

  it("サブボットがいない・プロフィールを設定していない・サーバーが未登録なら何もしない", async () => {
    expect(await setup({ nickname: "x", discordAvatarHash: null }).sync.apply("g9")).toBe(0)
    const none = setup(null)
    expect(await none.sync.apply("g1")).toBe(0)
    expect(none.subs[0]?.rest.patch).not.toHaveBeenCalled()
    const missing = setup({ nickname: "x", discordAvatarHash: null }, false)
    expect(await missing.sync.apply("g1")).toBe(0)
    expect(missing.repos.botProfiles.findByGuildId).not.toHaveBeenCalled()
  })

  it("アイコンを取得できなければ失敗にし、どの Bot も変更しない", async () => {
    const { sync, subs, fetch } = setup({ nickname: "x", discordAvatarHash: "hash" })
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(sync.apply("g1")).rejects.toThrow("failed to download the bot avatar (404)")
    expect(subs[0]?.rest.patch).not.toHaveBeenCalled()
  })

  it("Content-Type が無ければ拡張子から決める", async () => {
    const { sync, subs, fetch } = setup({ nickname: "x", discordAvatarHash: "hash" })
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([1])))
    await sync.apply("g1", "sub1")
    const [, options] = subs[0]?.rest.patch.mock.calls[0] as unknown as [string, { body: { avatar: string } }]
    expect(options.body.avatar.startsWith("data:")).toBe(true)
  })
})
