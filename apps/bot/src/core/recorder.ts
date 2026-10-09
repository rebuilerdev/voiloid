/**
 * 読み上げセッションの記録。
 * - リアルタイムの状態は Redis（Web GUI の「読み上げ中」表示に使う）
 * - 履歴は PostgreSQL の VoiceSession
 */
import type { Repositories } from "@voiloid/database"
import { redisKeys, type GuildSessionState } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"

import type { SessionInfo, SessionRecorder } from "./sessions"

const toState = (session: SessionInfo): GuildSessionState => ({
  botUserId: session.botUserId,
  textChannelId: session.textChannelId,
  textChannelName: session.textChannelName,
  voiceChannelId: session.voiceChannelId,
  voiceChannelName: session.voiceChannelName,
  startedAt: session.startedAt.toISOString(),
})

export function createSessionRecorder(redis: Redis, repos: Repositories): SessionRecorder {
  return {
    async started(session, startedByUserId) {
      await redis.hset(redisKeys.guildSessions(session.guildId), session.botUserId, JSON.stringify(toState(session)))
      const guild = await repos.guilds.findByDiscordId(session.guildId)
      if (!guild) return null
      return repos.voiceSessions.start({
        guildId: guild.id,
        botUserId: session.botUserId,
        textChannelId: session.textChannelId,
        voiceChannelId: session.voiceChannelId,
        startedByUserId,
      })
    },

    async updated(session) {
      await redis.hset(redisKeys.guildSessions(session.guildId), session.botUserId, JSON.stringify(toState(session)))
    },

    async ended(session, historyId, reason) {
      await redis.hdel(redisKeys.guildSessions(session.guildId), session.botUserId)
      if (historyId) await repos.voiceSessions.end(historyId, reason)
    },
  }
}

/** 起動時: 前回のプロセスのセッション（Redis の状態・DB の未終了の履歴）を片付ける */
export async function cleanupStaleSessions(redis: Redis, repos: Repositories, botUserIds: string[]): Promise<void> {
  let cursor = "0"
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", redisKeys.guildSessions("*"), "COUNT", 200)
    cursor = next
    for (const key of keys) await redis.hdel(key, ...botUserIds)
  } while (cursor !== "0")
  await repos.voiceSessions.endOpenSessions(botUserIds, "restart")
}
