/**
 * Redis を使った固定ウィンドウのレート制限（複数プロセスでも共有される）。
 */
import { AppError } from "@voiloid/shared"
import { redisKeys } from "@voiloid/shared/protocol"
import type { FastifyRequest } from "fastify"
import type { Redis } from "ioredis"

export interface RateLimitRule {
  bucket: string
  limit: number
  windowSeconds: number
}

export const RATE_LIMITS = {
  /** API 全体（ユーザーごと） */
  default: { bucket: "api", limit: 300, windowSeconds: 60 },
  /** 未ログインの認証処理（IP ごと） */
  auth: { bucket: "auth", limit: 20, windowSeconds: 60 },
  /** 音声合成のプレビュー */
  preview: { bucket: "preview", limit: 20, windowSeconds: 60 },
  /** Bot プロフィールの変更（Discord のレート制限が厳しい） */
  botProfile: { bucket: "bot-profile", limit: 5, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>

export function createRateLimiter(redis: Redis) {
  return async function check(request: FastifyRequest, rule: RateLimitRule): Promise<void> {
    const subject = request.session?.userId ?? `ip:${request.ip}`
    const window = Math.floor(Date.now() / 1000 / rule.windowSeconds)
    const key = redisKeys.rateLimit(`${rule.bucket}:${subject}:${window}`)
    const [[, count]] = (await redis.multi().incr(key).expire(key, rule.windowSeconds).exec()) as [[null, number]]
    if (count > rule.limit) {
      throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", {
        retryAfterSeconds: rule.windowSeconds - (Math.floor(Date.now() / 1000) % rule.windowSeconds),
      })
    }
  }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
