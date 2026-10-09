import { describe, expect, it } from "vitest"

import { loadConfig } from "./config"

const valid = {
  APP_ORIGIN: "https://console.example.com",
  SESSION_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  IP_HASH_SALT: "0123456789abcdef",
  DATABASE_URL: "postgresql://u:p@db:5432/voiloid",
  REDIS_URL: "redis://redis:6379",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "secret",
  DISCORD_BOT_TOKEN: "token",
  GATEWAY_INTERNAL_URL: "http://gateway:4100",
  INTERNAL_API_TOKEN: "x".repeat(32),
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
}

describe("loadConfig", () => {
  it("既定値を補う", () => {
    expect(loadConfig(valid)).toMatchObject({
      PORT: 4000,
      COOKIE_SECURE: true,
      USAGE_TIME_ZONE: "Asia/Tokyo",
      S3_FORCE_PATH_STYLE: false,
    })
    expect(loadConfig({ ...valid, COOKIE_SECURE: "false", PORT: "8080" })).toMatchObject({
      COOKIE_SECURE: false,
      PORT: 8080,
    })
  })

  it("不正な値は項目名だけを示して失敗する（値は出さない）", () => {
    expect(() => loadConfig({ ...valid, SESSION_ENCRYPTION_KEY: "short", DISCORD_BOT_TOKEN: "" })).toThrow(
      /SESSION_ENCRYPTION_KEY[\s\S]*DISCORD_BOT_TOKEN/,
    )
    try {
      loadConfig({ ...valid, INTERNAL_API_TOKEN: "leaked-short" })
    } catch (error) {
      expect(String(error)).not.toContain("leaked-short")
    }
  })
})
