import { redisKeys } from "@voiloid/shared/protocol"
import { Redis } from "ioredis"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { TEST_REDIS_URL } from "../../../../test/env"
import { createSessionStore } from "./session"

const redis = new Redis(TEST_REDIS_URL)
const store = createSessionStore(redis, { ttlSeconds: 60, encryptionKey: Buffer.alloc(32, 3) })
const data = { userId: "u", discordUserId: "d", accessToken: "a", refreshToken: "r", accessTokenExpiresAt: 1 }

beforeEach(() => redis.flushdb())
afterAll(() => redis.quit())

describe("createSessionStore", () => {
  it("作成・取得・更新・破棄", async () => {
    const session = await store.create(data)
    expect(await store.get(session.id)).toEqual(session)
    await store.update({ ...session, accessToken: "a2" })
    expect((await store.get(session.id))?.accessToken).toBe("a2")
    await store.destroy(session.id)
    expect(await store.get(session.id)).toBeNull()
  })

  it("利用すると有効期限を延長する", async () => {
    const session = await store.create(data)
    await redis.expire(redisKeys.webSession(session.id), 5)
    await store.get(session.id)
    expect(await redis.ttl(redisKeys.webSession(session.id))).toBeGreaterThan(5)
  })

  it("形式が不正な ID は Redis を参照しない", async () => {
    expect(await store.get("../../etc")).toBeNull()
    await store.destroy("bad id")
  })

  it("壊れた・別の鍵で暗号化されたセッションは破棄する", async () => {
    const session = await store.create(data)
    const other = createSessionStore(redis, { ttlSeconds: 60, encryptionKey: Buffer.alloc(32, 4) })
    expect(await other.get(session.id)).toBeNull()
    expect(await redis.exists(redisKeys.webSession(session.id))).toBe(0)

    const broken = await store.create(data)
    await redis.set(redisKeys.webSession(broken.id), "{not json")
    expect(await store.get(broken.id)).toBeNull()
  })

  it("ユーザーのセッションを数え、まとめて破棄する（期限切れの ID は数えない）", async () => {
    const a = await store.create(data)
    const b = await store.create(data)
    await store.create({ ...data, userId: "other" })
    await redis.del(redisKeys.webSession(b.id))
    expect(await store.countForUser("u")).toBe(1)
    await store.create(data)
    expect(await store.destroyAllForUser("u")).toBe(2)
    expect(await store.get(a.id)).toBeNull()
    expect(await store.countForUser("u")).toBe(0)
    expect(await store.countForUser("other")).toBe(1)
  })
})
