import { describe, expect, it } from "vitest"

import { loadConfig } from "./config"

describe("loadConfig", () => {
  const valid = {
    INTERNAL_API_TOKEN: "x".repeat(32),
    DATABASE_URL: "postgresql://u:p@db/voiloid",
    REDIS_URL: "redis://redis:6379",
  }

  it("既定値を補う", () => {
    expect(loadConfig(valid)).toMatchObject({ WORKER_PORT: 4100, INTERNAL_PORT: 4101, JOB_TIMEOUT_MS: 30_000 })
  })

  it("不足があれば失敗する", () => {
    expect(() => loadConfig({ ...valid, INTERNAL_API_TOKEN: "short" })).toThrow(/INTERNAL_API_TOKEN/)
  })
})
