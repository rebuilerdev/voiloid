import { describe, expect, it, vi } from "vitest"

import { TtlCache } from "./ttl-cache"

describe("TtlCache", () => {
  it("有効期限内は再読み込みせず、期限切れ・削除後は読み込む", async () => {
    let now = 0
    const cache = new TtlCache<number>(100, () => now)
    const load = vi.fn(() => Promise.resolve(now))
    expect(await cache.getOrLoad("a", load)).toBe(0)
    now = 50
    expect(await cache.getOrLoad("a", load)).toBe(0)
    now = 150
    expect(await cache.getOrLoad("a", load)).toBe(150)
    cache.delete("a")
    expect(await cache.getOrLoad("a", load)).toBe(150)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it("同時の読み込みは 1 回にまとめ、失敗はキャッシュしない", async () => {
    const cache = new TtlCache<string>(1000)
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue("ok")
    await expect(cache.getOrLoad("k", load)).rejects.toThrow("db down")
    const [a, b] = await Promise.all([cache.getOrLoad("k", load), cache.getOrLoad("k", load)])
    expect([a, b]).toEqual(["ok", "ok"])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("条件に合うキー・全体を削除する", async () => {
    const cache = new TtlCache<string>(1000)
    const load = vi.fn((key: string) => Promise.resolve(key))
    await cache.getOrLoad("u1:g1", () => load("1"))
    await cache.getOrLoad("u2:g1", () => load("2"))
    cache.deleteWhere((key) => key.startsWith("u1:"))
    await cache.getOrLoad("u1:g1", () => load("1"))
    await cache.getOrLoad("u2:g1", () => load("2"))
    expect(load).toHaveBeenCalledTimes(3)
    cache.clear()
    await cache.getOrLoad("u2:g1", () => load("2"))
    expect(load).toHaveBeenCalledTimes(4)
  })
})
