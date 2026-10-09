import { describe, expect, it } from "vitest"

import { loadConfig } from "./config"

const valid = {
  DISCORD_TOKEN: "token",
  DISCORD_CLIENT_ID: "123456789012345678",
  APP_ORIGIN: "https://console.example.com",
  DATABASE_URL: "postgresql://u:p@db/voiloid",
  REDIS_URL: "redis://redis:6379",
  GATEWAY_INTERNAL_URL: "http://gateway:4101",
  INTERNAL_API_TOKEN: "x".repeat(32),
}

describe("loadConfig", () => {
  it("サブボットのトークンをカンマ区切りで受け付ける", () => {
    expect(loadConfig({ ...valid, SUB_BOT_TOKENS: " a, ,b " }).SUB_BOT_TOKENS).toEqual(["a", "b"])
    expect(loadConfig(valid)).toMatchObject({ SUB_BOT_TOKENS: [], MAX_QUEUE: 30 })
  })

  it("不正な値は失敗する", () => {
    expect(() => loadConfig({ ...valid, DISCORD_CLIENT_ID: "abc" })).toThrow(/DISCORD_CLIENT_ID/)
  })
})
