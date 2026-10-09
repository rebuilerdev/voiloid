import type { VoiceSettings } from "@voiloid/shared/contracts"

import type { DbClient } from "../client"
import { voiceFromColumns, voiceToColumns } from "../mappers"

export interface DiscordUserProfile {
  discordUserId: string
  username: string
  globalName: string | null
  avatar: string | null
}

export function userRepository(db: DbClient) {
  return {
    /** ログイン時に Discord のプロフィールで作成・更新する */
    upsertFromDiscord(profile: DiscordUserProfile) {
      const data = {
        discordUsername: profile.username,
        discordGlobalName: profile.globalName,
        discordAvatar: profile.avatar,
      }
      return db.user.upsert({
        where: { discordUserId: profile.discordUserId },
        create: { discordUserId: profile.discordUserId, ...data },
        update: data,
      })
    },

    /** 利用停止（理由は必須）。null で再開 */
    setSuspension(userId: string, suspension: { reason: string; byUserId: string } | null) {
      return db.user.update({
        where: { id: userId },
        data: suspension
          ? { suspendedAt: new Date(), suspendedReason: suspension.reason, suspendedByUserId: suspension.byUserId }
          : { suspendedAt: null, suspendedReason: null, suspendedByUserId: null },
      })
    },

    /** 利用停止中のユーザーの Discord ID（Bot が発言を読み上げないために使う） */
    async suspendedDiscordIds(): Promise<string[]> {
      const rows = await db.user.findMany({ where: { suspendedAt: { not: null } }, select: { discordUserId: true } })
      return rows.map((r) => r.discordUserId)
    },

    findById(id: string) {
      return db.user.findUnique({ where: { id } })
    },

    findByDiscordId(discordUserId: string) {
      return db.user.findUnique({ where: { discordUserId } })
    },

    /** マイボイス。未設定なら null */
    async getVoice(userId: string): Promise<VoiceSettings | null> {
      const row = await db.userVoiceSettings.findUnique({ where: { userId } })
      return row ? voiceFromColumns(row) : null
    },

    /** null = マイボイスを解除（各サーバーのデフォルト音声を使う） */
    async setVoice(userId: string, voice: VoiceSettings | null): Promise<void> {
      if (voice === null) {
        await db.userVoiceSettings.deleteMany({ where: { userId } })
        return
      }
      const columns = voiceToColumns(voice)
      await db.userVoiceSettings.upsert({ where: { userId }, create: { userId, ...columns }, update: columns })
    },

    /** 読み上げ時の声の候補: サーバーごとの声 → マイボイス */
    async getVoiceForGuild(discordUserId: string, guildId: string): Promise<VoiceSettings | null> {
      const user = await db.user.findUnique({
        where: { discordUserId },
        select: {
          voiceSettings: true,
          guildVoiceSettings: { where: { guildId }, take: 1 },
        },
      })
      const row = user?.guildVoiceSettings[0] ?? user?.voiceSettings
      return row ? voiceFromColumns(row) : null
    },
  }
}

export type UserRepository = ReturnType<typeof userRepository>
