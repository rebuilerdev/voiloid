/**
 * Redis のリアルタイム状態（Gateway・Bot が更新する）の読み取り。
 */
import {
  guildSessionSchema,
  redisKeys,
  workerLiveSchema,
  type GuildSessionState,
  type Invalidation,
  type WorkerLive,
} from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"
import { z } from "zod"

/** Bot がこの秒数以上更新していなければ offline とみなす */
export const BOT_HEARTBEAT_STALE_SECONDS = 60

const botHeartbeatSchema = z.object({ at: z.iso.datetime(), pingMs: z.number(), guilds: z.number().optional() })

function parse<T>(schema: z.ZodType<T>, raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function createLiveService(redis: Redis, now: () => Date) {
  return {
    /** Worker ID（内部）→ リアルタイム状態 */
    async workers(workerIds: string[]): Promise<Map<string, WorkerLive>> {
      if (workerIds.length === 0) return new Map()
      const values = await redis.mget(workerIds.map((id) => redisKeys.workerLive(id)))
      return new Map(
        workerIds.flatMap((id, i) => {
          const live = parse(workerLiveSchema, values[i])
          return live ? [[id, live] as const] : []
        }),
      )
    },

    /** サーバーの読み上げセッション（Discord Guild ID ごと） */
    async guildSessions(discordGuildIds: string[]): Promise<Map<string, GuildSessionState[]>> {
      if (discordGuildIds.length === 0) return new Map()
      const pipeline = redis.pipeline()
      for (const id of discordGuildIds) pipeline.hvals(redisKeys.guildSessions(id))
      const results = (await pipeline.exec()) ?? []
      return new Map(
        discordGuildIds.map((id, i) => {
          const values = (results[i]?.[1] as string[] | undefined) ?? []
          return [id, values.flatMap((v) => parse(guildSessionSchema, v) ?? [])] as const
        }),
      )
    },

    async botHeartbeat(): Promise<{ online: boolean; pingMs: number }> {
      const heartbeat = parse(botHeartbeatSchema, await redis.get(redisKeys.botHeartbeat()))
      if (!heartbeat) return { online: false, pingMs: 0 }
      const age = (now().getTime() - new Date(heartbeat.at).getTime()) / 1000
      return { online: age < BOT_HEARTBEAT_STALE_SECONDS, pingMs: Math.max(0, Math.round(heartbeat.pingMs)) }
    },

    /** 設定変更を Bot・Gateway に通知する（キャッシュの破棄） */
    async invalidate(message: Invalidation): Promise<void> {
      await redis.publish(redisKeys.invalidation(), JSON.stringify(message))
    },
  }
}

export type LiveService = ReturnType<typeof createLiveService>
