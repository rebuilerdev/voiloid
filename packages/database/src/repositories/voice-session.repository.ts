import type { DbClient } from "../client"

export interface VoiceSessionStart {
  guildId: string
  botUserId: string
  textChannelId: string
  voiceChannelId: string
  startedByUserId: string | null
}

export function voiceSessionRepository(db: DbClient) {
  return {
    async start(input: VoiceSessionStart): Promise<string> {
      const session = await db.voiceSession.create({ data: input, select: { id: true } })
      return session.id
    },

    async end(id: string, endReason: string): Promise<void> {
      await db.voiceSession.updateMany({ where: { id, endedAt: null }, data: { endedAt: new Date(), endReason } })
    },

    /** Bot の起動時: 前回のプロセスで終了処理されなかったセッションを閉じる */
    async endOpenSessions(botUserIds: string[], endReason: string): Promise<number> {
      const result = await db.voiceSession.updateMany({
        where: { botUserId: { in: botUserIds }, endedAt: null },
        data: { endedAt: new Date(), endReason },
      })
      return result.count
    },
  }
}

export type VoiceSessionRepository = ReturnType<typeof voiceSessionRepository>
