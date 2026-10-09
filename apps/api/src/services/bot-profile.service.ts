/**
 * サーバーごとの Bot プロフィール（Discord: Modify Current Member）。
 * 入力 Validation → 画像 Upload → Discord API → 成功 → DB Transaction の順で行い、
 * Discord への反映に失敗した場合は DB を更新しない。
 */
import { randomUUID } from "node:crypto"

import { commitBotProfile } from "@voiloid/database"
import type { GuildBotProfile, UpdateGuildBotProfileRequest } from "@voiloid/shared/contracts"
import { z } from "zod"

import type { AppDeps } from "../deps"
import { cdn, type DiscordUser, toAppError } from "../lib/discord"
import type { Session } from "../lib/session"
import type { AccessService } from "./access.service"

const BOT_USER_CACHE_KEY = "voiloid:bot-user"
const BOT_USER_CACHE_SECONDS = 60 * 60

const botUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
})

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
}

export function createBotProfileService(deps: AppDeps, access: AccessService) {
  async function botUser(): Promise<DiscordUser> {
    const cached = await deps.redis.get(BOT_USER_CACHE_KEY)
    const parsed = cached ? botUserSchema.safeParse(JSON.parse(cached)) : null
    if (parsed?.success) return parsed.data
    let user
    try {
      user = await deps.discord.getBotUser()
    } catch (error) {
      throw toAppError(error)
    }
    await deps.redis.set(BOT_USER_CACHE_KEY, JSON.stringify(user), "EX", BOT_USER_CACHE_SECONDS)
    return user
  }

  async function toApi(
    discordGuildId: string,
    profile: { nickname: string | null; discordAvatarHash: string | null } | null,
  ): Promise<GuildBotProfile> {
    const bot = await botUser()
    return {
      nickname: profile?.nickname ?? null,
      avatarUrl: profile?.discordAvatarHash
        ? cdn.memberAvatar(discordGuildId, bot.id, profile.discordAvatarHash)
        : null,
      defaultName: bot.global_name ?? bot.username,
      defaultAvatarUrl: bot.avatar ? cdn.userAvatar(bot.id, bot.avatar) : undefined,
    }
  }

  return {
    async get(session: Session, discordGuildId: string): Promise<GuildBotProfile> {
      const { guild } = await access.requireManageableInstalled(session, discordGuildId)
      return toApi(discordGuildId, await deps.repos.botProfiles.findByGuildId(guild.id))
    },

    async update(
      session: Session,
      discordGuildId: string,
      input: UpdateGuildBotProfileRequest,
      ipHash: string,
    ): Promise<GuildBotProfile> {
      const { guild, asOperator } = await access.requireManageableInstalled(session, discordGuildId)
      if (input.nickname === undefined && input.avatar === undefined) {
        return toApi(discordGuildId, await deps.repos.botProfiles.findByGuildId(guild.id))
      }

      // 1. 画像の原本を保存する（Discord への反映が失敗したら削除する）
      let objectKey: string | null | undefined
      if (typeof input.avatar === "string") {
        const contentType = input.avatar.slice(5, input.avatar.indexOf(";"))
        const body = Buffer.from(input.avatar.slice(input.avatar.indexOf(",") + 1), "base64")
        objectKey = `bot-avatars/${guild.id}/${randomUUID()}.${EXTENSIONS[contentType] ?? "bin"}`
        await deps.storage.put(objectKey, body, contentType)
      } else if (input.avatar === null) {
        objectKey = null
      }

      // 2. Discord に反映する
      let member
      try {
        member = await deps.discord.modifyCurrentMember(discordGuildId, {
          ...(input.nickname === undefined ? {} : { nick: input.nickname }),
          ...(input.avatar === undefined ? {} : { avatar: input.avatar }),
        })
      } catch (error) {
        if (objectKey) await deps.storage.delete(objectKey).catch(() => undefined)
        throw toAppError(error)
      }

      // 3. 成功した内容だけを DB に確定する
      const saved = await commitBotProfile(
        deps.db,
        guild.id,
        {
          ...(input.nickname === undefined ? {} : { nickname: member.nick ?? null }),
          ...(objectKey === undefined ? {} : { avatarObjectKey: objectKey, discordAvatarHash: member.avatar ?? null }),
          updatedByUserId: session.userId,
        },
        ipHash,
        asOperator ? { asOperator: true } : undefined,
      )
      return toApi(discordGuildId, saved)
    },
  }
}

export type BotProfileService = ReturnType<typeof createBotProfileService>
