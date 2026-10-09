/**
 * Web のログインセッション（Redis）。Cookie にはランダムなセッション ID だけを入れる。
 * Discord のトークンは暗号化して保存し、Frontend には渡さない。
 */
import { redisKeys } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"
import { z } from "zod"

import { decrypt, encrypt, randomToken } from "./crypto"

export interface Session {
  id: string
  /** User の内部 ID */
  userId: string
  discordUserId: string
  accessToken: string
  refreshToken: string
  /** Discord のアクセストークンの失効時刻（epoch ms） */
  accessTokenExpiresAt: number
}

const storedSchema = z.object({
  userId: z.string(),
  discordUserId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.number(),
})

export interface SessionStore {
  create(data: Omit<Session, "id">): Promise<Session>
  get(id: string): Promise<Session | null>
  update(session: Session): Promise<void>
  destroy(id: string): Promise<void>
  /** ユーザーのすべてのセッションを破棄する（強制ログアウト・利用停止） */
  destroyAllForUser(userId: string): Promise<number>
  /** ユーザーのログイン中のセッション数 */
  countForUser(userId: string): Promise<number>
}

/** セッション ID の形式（randomToken(32) = base64url 43 文字） */
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/

export function createSessionStore(redis: Redis, options: { ttlSeconds: number; encryptionKey: Buffer }): SessionStore {
  const key = options.encryptionKey

  const save = async (session: Session) => {
    const stored = {
      userId: session.userId,
      discordUserId: session.discordUserId,
      accessToken: encrypt(session.accessToken, key),
      refreshToken: encrypt(session.refreshToken, key),
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    }
    await redis.set(redisKeys.webSession(session.id), JSON.stringify(stored), "EX", options.ttlSeconds)
  }

  /** 期限切れで消えたセッションを索引から取り除き、残っている ID を返す */
  async function liveSessionIds(userId: string): Promise<string[]> {
    const ids = await redis.smembers(redisKeys.userSessions(userId))
    const live: string[] = []
    for (const id of ids) {
      if (await redis.exists(redisKeys.webSession(id))) live.push(id)
      else await redis.srem(redisKeys.userSessions(userId), id)
    }
    return live
  }

  return {
    async create(data) {
      const session = { ...data, id: randomToken(32) }
      await save(session)
      // ユーザーごとのセッションの索引（強制ログアウト用）
      await redis.sadd(redisKeys.userSessions(data.userId), session.id)
      await redis.expire(redisKeys.userSessions(data.userId), options.ttlSeconds)
      return session
    },

    async get(id) {
      if (!SESSION_ID.test(id)) return null
      const raw = await redis.get(redisKeys.webSession(id))
      if (!raw) return null
      try {
        const stored = storedSchema.parse(JSON.parse(raw))
        // 利用中は有効期限を延長する
        await redis.expire(redisKeys.webSession(id), options.ttlSeconds)
        return {
          id,
          userId: stored.userId,
          discordUserId: stored.discordUserId,
          accessToken: decrypt(stored.accessToken, key),
          refreshToken: decrypt(stored.refreshToken, key),
          accessTokenExpiresAt: stored.accessTokenExpiresAt,
        }
      } catch {
        // 壊れた・鍵の異なるセッションは破棄する
        await redis.del(redisKeys.webSession(id))
        return null
      }
    },

    async update(session) {
      await save(session)
      await redis.expire(redisKeys.userSessions(session.userId), options.ttlSeconds)
    },

    async destroy(id) {
      if (!SESSION_ID.test(id)) return
      const raw = await redis.get(redisKeys.webSession(id))
      await redis.del(redisKeys.webSession(id))
      const userId = raw ? storedSchema.safeParse(JSON.parse(raw)).data?.userId : undefined
      if (userId) await redis.srem(redisKeys.userSessions(userId), id)
    },

    async destroyAllForUser(userId) {
      const ids = await redis.smembers(redisKeys.userSessions(userId))
      if (ids.length > 0) await redis.del(...ids.map((id) => redisKeys.webSession(id)))
      await redis.del(redisKeys.userSessions(userId))
      return ids.length
    },

    async countForUser(userId) {
      return (await liveSessionIds(userId)).length
    },
  }
}
