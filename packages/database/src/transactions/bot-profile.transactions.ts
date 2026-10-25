import type { Database } from "../client"
import { auditRepository } from "../repositories/audit.repository"
import { botProfileRepository, type BotProfileUpdate } from "../repositories/bot-profile.repository"

/**
 * Bot プロフィールの確定。Discord API への反映が成功した後にだけ呼ぶ。
 * 入力 Validation → 画像 Upload → Discord API → 成功 → この Transaction
 * 差し替える前の画像のキー（previousAvatarObjectKey）も返す。呼び出し側が確定後にストレージから削除する。
 */
export function commitBotProfile(
  db: Database,
  guildId: string,
  update: BotProfileUpdate,
  ipHash: string | null,
  extraMetadata?: Record<string, boolean | string>,
) {
  return db.$transaction(async (tx) => {
    const previous = await botProfileRepository(tx).findByGuildId(guildId)
    const profile = await botProfileRepository(tx).upsert(guildId, update)
    await auditRepository(tx).record({
      actorUserId: update.updatedByUserId,
      guildId,
      action: "guild.bot_profile.update",
      targetType: "guild",
      targetId: guildId,
      // 画像データは記録しない
      metadata: {
        nickname: update.nickname === undefined ? "unchanged" : update.nickname === null ? "reset" : "changed",
        avatar:
          update.avatarObjectKey === undefined ? "unchanged" : update.avatarObjectKey === null ? "reset" : "changed",
        ...extraMetadata,
      },
      ipHash,
    })
    return { profile, previousAvatarObjectKey: previous?.avatarObjectKey ?? null }
  })
}
