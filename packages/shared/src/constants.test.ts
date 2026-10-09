import { describe, expect, it } from "vitest"

import { botInviteUrl } from "./constants"

describe("botInviteUrl", () => {
  it("メインの Bot はコマンドを含めて招待し、接続・発言・ニックネームの変更を求める", () => {
    const url = new URL(botInviteUrl("111", "main"))
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize")
    expect(url.searchParams.get("client_id")).toBe("111")
    expect(url.searchParams.get("scope")).toBe("bot applications.commands")
    expect(url.searchParams.get("permissions")).toBe(String((1 << 20) | (1 << 21) | (1 << 26)))
    expect(url.searchParams.has("guild_id")).toBe(false)
  })

  it("サブボットはコマンドを含めず、チャンネルを見る・接続・発言だけを求める。サーバーを指定できる", () => {
    const url = new URL(botInviteUrl("222", "sub", "333"))
    expect(url.searchParams.get("scope")).toBe("bot")
    expect(url.searchParams.get("permissions")).toBe("3146752")
    expect(url.searchParams.get("guild_id")).toBe("333")
    expect(url.searchParams.get("disable_guild_select")).toBe("true")
  })
})
