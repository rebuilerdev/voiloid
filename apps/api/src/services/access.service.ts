/**
 * Discord の権限確認。Frontend の表示に関係なく、すべての API で Backend が確認する。
 * - サーバーを管理できる: Owner / Administrator / Manage Guild
 * - ユーザーのサーバー一覧は Redis に短時間キャッシュする
 */
import type { Guild } from "@voiloid/database"
import { AppError, forbidden, notFound } from "@voiloid/shared"
import { redisKeys } from "@voiloid/shared/protocol"
import { z } from "zod"

import type { AppDeps } from "../deps"
import { canManageGuild, type DiscordPartialGuild, DiscordHttpError, toAppError } from "../lib/discord"
import type { Session } from "../lib/session"
import type { OperatorService } from "./operator.service"

const GUILDS_CACHE_SECONDS = 60
/** Discord のレート制限（429）のときに使う、直近のサーバー一覧の保持期間 */
const GUILDS_STALE_SECONDS = 600
/** 失効の少し前に更新する */
const REFRESH_MARGIN_MS = 60_000

const cachedGuildsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable().optional(),
    owner: z.boolean(),
    permissions: z.string(),
  }),
)

export interface AccessibleGuild {
  discord: DiscordPartialGuild
  canManage: boolean
  /** Bot が導入されていない（一度も導入されていない）サーバーは null */
  guild: Guild | null
  /** サーバーの管理権限ではなく、運営者（editor 以上）として操作している */
  asOperator?: boolean
}

type RefreshedTokens = Pick<Session, "accessToken" | "refreshToken" | "accessTokenExpiresAt">

export function createAccessService(deps: AppDeps, operators: OperatorService) {
  /**
   * 実行中の Discord への問い合わせ。同じ問い合わせが同時に来たら、1 回だけ実行して結果を共有する
   * （ページは複数の API を同時に呼ぶため。Discord のレート制限と、トークンの二重更新を防ぐ）
   */
  const refreshing = new Map<string, Promise<RefreshedTokens>>()
  const fetchingGuilds = new Map<string, Promise<DiscordPartialGuild[]>>()

  function once<T>(inflight: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
    const running = inflight.get(key)
    if (running) return running
    const promise = run().finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }

  /** 期限が近ければ Discord のアクセストークンを更新する。更新できなければ再ログインが必要 */
  async function accessToken(session: Session): Promise<string> {
    if (session.accessTokenExpiresAt - REFRESH_MARGIN_MS > deps.now().getTime()) return session.accessToken
    // 同じセッションの更新が同時に走ると、2 回目は使用済みの refresh token で失敗してログアウトになるため 1 回にまとめる
    // 同時に来た別のリクエストのセッションにも、更新後のトークンをすべて反映する（古い refresh token を保存し直さない）
    Object.assign(session, await once(refreshing, session.id, () => refreshAccessToken(session)))
    return session.accessToken
  }

  async function refreshAccessToken(session: Session): Promise<RefreshedTokens> {
    try {
      const tokens = await deps.discord.refreshTokens(session.refreshToken)
      const refreshed = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.expiresAt,
      }
      await deps.sessions.update({ ...session, ...refreshed })
      return refreshed
    } catch (error) {
      if (error instanceof DiscordHttpError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        await deps.sessions.destroy(session.id)
        throw new AppError("UNAUTHORIZED", "Please log in again.")
      }
      throw toAppError(error)
    }
  }

  async function readGuilds(key: string): Promise<DiscordPartialGuild[] | null> {
    const cached = await deps.redis.get(key)
    if (!cached) return null
    const parsed = cachedGuildsSchema.safeParse(JSON.parse(cached))
    return parsed.success ? parsed.data : null
  }

  /** ユーザーが参加している Discord サーバー（キャッシュ付き。同時の取得は 1 回にまとめる） */
  async function discordGuilds(session: Session): Promise<DiscordPartialGuild[]> {
    const key = redisKeys.userGuilds(session.discordUserId)
    const cached = await readGuilds(key)
    if (cached) return cached
    return once(fetchingGuilds, session.discordUserId, () => fetchGuilds(session, key))
  }

  async function fetchGuilds(session: Session, key: string): Promise<DiscordPartialGuild[]> {
    const staleKey = redisKeys.userGuildsStale(session.discordUserId)
    let guilds: DiscordPartialGuild[]
    try {
      guilds = await deps.discord.getCurrentUserGuilds(await accessToken(session))
    } catch (error) {
      if (error instanceof AppError) throw error
      if (error instanceof DiscordHttpError && error.status === 401) {
        await deps.sessions.destroy(session.id)
        throw new AppError("UNAUTHORIZED", "Please log in again.")
      }
      // レート制限なら、直近に取得した一覧で表示を続ける
      if (error instanceof DiscordHttpError && error.status === 429) {
        const stale = await readGuilds(staleKey)
        if (stale) return stale
      }
      throw toAppError(error)
    }
    const json = JSON.stringify(guilds)
    await deps.redis.set(key, json, "EX", GUILDS_CACHE_SECONDS)
    await deps.redis.set(staleKey, json, "EX", GUILDS_STALE_SECONDS)
    return guilds
  }

  /** 参加しているサーバーと、DB 上の情報 */
  async function accessibleGuilds(session: Session): Promise<AccessibleGuild[]> {
    const guilds = await discordGuilds(session)
    const records = await deps.repos.guilds.findManyByDiscordIds(guilds.map((g) => g.id))
    const byId = new Map(records.map((r) => [r.discordGuildId, r]))
    return guilds.map((discord) => ({
      discord,
      canManage: canManageGuild(discord),
      guild: byId.get(discord.id) ?? null,
    }))
  }

  /**
   * サーバーの管理権限を確認する。
   * 参加していないサーバーは存在を明かさないため 404、参加しているが権限が無い場合は 403。
   */
  async function requireManageable(session: Session, discordGuildId: string): Promise<AccessibleGuild> {
    const target = (await accessibleGuilds(session)).find((g) => g.discord.id === discordGuildId)
    if (target?.canManage) return target
    // 運営者（editor 以上）は、参加していない・管理権限の無いサーバーも操作できる
    if (await operators.allows(session, "editor")) {
      const guild = await deps.repos.guilds.findByDiscordId(discordGuildId)
      if (guild) {
        return {
          discord: { id: guild.discordGuildId, name: guild.name, icon: guild.icon, owner: false, permissions: "0" },
          canManage: true,
          guild,
          asOperator: true,
        }
      }
    }
    if (!target) throw notFound("Guild")
    throw forbidden("You need the Manage Server permission for this server.")
  }

  return {
    accessibleGuilds,
    requireManageable,

    /** 管理できるサーバー（Bot 未導入を含む） */
    async manageableGuilds(session: Session): Promise<AccessibleGuild[]> {
      return (await accessibleGuilds(session)).filter((g) => g.canManage)
    },

    /** Bot が導入されている、参加中のサーバー */
    async installedMemberGuilds(session: Session): Promise<(AccessibleGuild & { guild: Guild })[]> {
      return (await accessibleGuilds(session)).filter(
        (g): g is AccessibleGuild & { guild: Guild } => g.guild?.botInstalled === true,
      )
    },

    /** 管理権限があり、Bot が導入されているサーバー */
    async requireManageableInstalled(
      session: Session,
      discordGuildId: string,
    ): Promise<AccessibleGuild & { guild: Guild }> {
      const target = await requireManageable(session, discordGuildId)
      const guild = target.guild
      if (!guild?.botInstalled) throw new AppError("NOT_FOUND", "The bot is not installed on this server.")
      // 利用停止中のサーバーは、運営者以外は設定を変更・参照できない
      if (guild.suspendedAt && !target.asOperator)
        throw forbidden("This server has been suspended by the service operator.")
      return { ...target, guild }
    },

    /** ログアウト時などにキャッシュを破棄する */
    async clearCache(session: Session): Promise<void> {
      await deps.redis.del(redisKeys.userGuilds(session.discordUserId))
    },
  }
}

export type AccessService = ReturnType<typeof createAccessService>
