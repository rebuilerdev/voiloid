import { afterEach, describe, expect, it } from "vitest"

import { createDatabase, disconnectDatabase, getDatabase } from "./client"

const url = "postgresql://user:pass@127.0.0.1:1/none"

afterEach(() => disconnectDatabase())

describe("getDatabase", () => {
  it("プロセス内で同じクライアントを返す（Hot Reload で接続プールを増やさない）", () => {
    const first = getDatabase({ url })
    expect(getDatabase({ url })).toBe(first)
  })

  it("切断後は新しいクライアントを作る", async () => {
    const first = getDatabase({ url })
    await disconnectDatabase()
    expect(getDatabase({ url })).not.toBe(first)
  })

  it("未接続の状態で切断しても失敗しない", async () => {
    await expect(disconnectDatabase()).resolves.toBeUndefined()
  })
})

describe("createDatabase", () => {
  it("呼び出しごとに新しいクライアントを作る（接続はクエリ実行時）", () => {
    expect(createDatabase({ url, logQueries: true })).not.toBe(createDatabase({ url }))
  })
})
