/**
 * サーバーごとの Bot のプロフィール（名前・アイコン）を、そのサーバーにいるサブボットにも反映する。
 * 名前は DB（GuildBotProfile）から、アイコンはメインの Bot のサーバーでのアイコン（Discord の CDN）から取る。
 * サブボットのトークンはこのプロセスだけが持つため、Control API からの指示（sync-profile）で反映する。
 */
import type { Repositories } from "@voiloid/database"
import type { Client } from "discord.js"

const CDN = "https://cdn.discordapp.com"

export function createProfileSync(deps: {
  repos: Repositories
  /** メインの Bot のユーザー ID（アイコンの取得元） */
  mainUserId: string
  subs: Client<true>[]
  fetch?: typeof fetch
}) {
  const fetchImpl = deps.fetch ?? fetch

  /** メインの Bot のサーバーでのアイコンを data URI にする（Modify Current Member に渡す形式） */
  async function avatarDataUri(guildId: string, hash: string): Promise<string> {
    const ext = hash.startsWith("a_") ? "gif" : "png"
    const res = await fetchImpl(`${CDN}/guilds/${guildId}/users/${deps.mainUserId}/avatars/${hash}.${ext}?size=1024`)
    if (!res.ok) throw new Error(`failed to download the bot avatar (${res.status})`)
    const type = res.headers.get("content-type") ?? `image/${ext}`
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`
  }

  return {
    /** サーバーにいるサブボット（botUserId を指定するとその Bot だけ）に反映し、反映した数を返す */
    async apply(guildId: string, botUserId?: string): Promise<number> {
      const targets = deps.subs.filter(
        (client) => client.guilds.cache.has(guildId) && (botUserId === undefined || client.user.id === botUserId),
      )
      if (targets.length === 0) return 0
      const guild = await deps.repos.guilds.findByDiscordId(guildId)
      const profile = guild ? await deps.repos.botProfiles.findByGuildId(guild.id) : null
      // 一度もプロフィールを設定していないサーバーは、Developer Portal の設定のままにする
      if (!profile) return 0

      const body = {
        nick: profile.nickname,
        avatar: profile.discordAvatarHash ? await avatarDataUri(guildId, profile.discordAvatarHash) : null,
      }
      // Routes.guildMember は "@me" をエスケープしてしまうため、パスを直接書く（Modify Current Member）
      for (const client of targets) await client.rest.patch(`/guilds/${guildId}/members/@me`, { body })
      return targets.length
    },
  }
}

export type ProfileSync = ReturnType<typeof createProfileSync>
