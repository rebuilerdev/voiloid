import type { CurrentUser, MemberGuild, VoiceSettings } from "@voiloid/shared/contracts"
import { AppError } from "@voiloid/shared"

import type { AppDeps } from "../deps"
import { cdn } from "../lib/discord"
import type { Session } from "../lib/session"
import type { AccessService } from "./access.service"
import type { LiveService } from "./live.service"
import type { OperatorService } from "./operator.service"
import { enginesByGuild } from "./routing"

export function createMeService(deps: AppDeps, access: AccessService, live: LiveService, operators: OperatorService) {
  async function me(session: Session): Promise<CurrentUser> {
    const [user, voice, operatorRole] = await Promise.all([
      deps.repos.users.findById(session.userId),
      deps.repos.users.getVoice(session.userId),
      operators.roleOf(session.discordUserId),
    ])
    // ユーザーが削除されていればセッションも無効
    if (!user) throw new AppError("UNAUTHORIZED", "Please log in again.")
    return {
      id: user.discordUserId,
      username: user.discordUsername,
      displayName: user.discordGlobalName ?? user.discordUsername,
      avatarUrl: user.discordAvatar ? cdn.userAvatar(user.discordUserId, user.discordAvatar) : undefined,
      voice,
      isOperator: operatorRole !== null,
      operatorRole,
    }
  }

  return {
    me,

    async updateVoice(session: Session, voice: VoiceSettings | null): Promise<CurrentUser> {
      await deps.repos.users.setVoice(session.userId, voice)
      await live.invalidate({ kind: "user", userId: session.discordUserId })
      return me(session)
    },

    /** 参加しているサーバーと、自分のメッセージで使えるエンジン */
    async guilds(session: Session): Promise<MemberGuild[]> {
      const guilds = await access.installedMemberGuilds(session)
      const saved = await deps.repos.guildSettings.findManyByGuildIds(guilds.map((g) => g.guild.id))
      const byId = new Map(saved.map((s) => [s.guildId, s]))
      const settings = await Promise.all(
        guilds.map(async (g) => ({
          id: g.guild.id,
          settings: byId.get(g.guild.id) ?? (await deps.repos.guildSettings.getOrCreate(g.guild.id)),
        })),
      )
      const engines = await enginesByGuild(deps, settings, session.userId)
      return guilds.map((g) => ({
        id: g.discord.id,
        name: g.discord.name,
        iconUrl: g.discord.icon ? cdn.guildIcon(g.discord.id, g.discord.icon) : undefined,
        canManage: g.canManage,
        availableEngines: engines.get(g.guild.id) ?? [],
      }))
    },
  }
}

export type MeService = ReturnType<typeof createMeService>
