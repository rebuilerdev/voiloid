/**
 * 運営コンソール（サービスの運営者だけが使える）。
 * - 権限の確認はルート側で行う（operator.service: viewer < editor < admin < owner）
 * - 変更操作はすべて監査ログに `admin.*` として残し、影響の大きい操作は理由も残す
 * - サーバー設定・辞書・Bot プロフィールの変更は、サーバー管理者向けの API を運営者も使う（access.service）
 */
import {
  deleteUserData,
  deleteWorker,
  generatePublicId,
  generateWorkerCredential,
  guildVoice,
  readingModeFromDb,
  registerWorker,
  replaceWorkerConnections,
  rotateWorkerCredential,
  scopeFromDb,
  scopeToDb,
  voiceFromColumns,
  WorkerMode,
  WorkerType,
  workerModeFromDb,
  workerStatusFromDb,
  type WorkerRecord,
} from "@voiloid/database"
import { AppError, DEFAULT_GUILD_VOICE, forbidden, notFound, validationError } from "@voiloid/shared"
import type {
  AdminGuild,
  AdminGuildDetail,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminWorker,
  AdminWorkerConnection,
  AuditLogEntry,
  AuditLogQuery,
  BotCommandResult,
  CreateWorkerRequest,
  CreateWorkerResponse,
  OperatorEntry,
  OperatorRole,
  Page,
  Suspension,
  UpdateAdminWorkerRequest,
  UpdateWorkerGuildsRequest,
  VoiceSettings,
} from "@voiloid/shared/contracts"

import type { AppDeps } from "../deps"
import { cdn } from "../lib/discord"
import type { Session } from "../lib/session"
import { addDays, dateRange, localDate, startOfDay, startOfLocalDate } from "../lib/time"
import type { LiveService } from "./live.service"
import type { OperatorService } from "./operator.service"
import { toApiWorker } from "./worker.service"

const PAGE_SIZE = 50
const DEGRADED_PING_MS = 1000

type AuditRow = Awaited<ReturnType<AppDeps["repos"]["admin"]["auditLogs"]>>["items"][number]

const displayName = (user: { discordUsername: string; discordGlobalName: string | null }) =>
  user.discordGlobalName ?? user.discordUsername

function toAuditEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    actor: row.actor ? { id: row.actor.discordUserId, name: displayName(row.actor) } : null,
    guild: row.guild ? { id: row.guild.discordGuildId, name: row.guild.name } : null,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

type AdminWorkerRow = WorkerRecord & {
  owner?: { discordUserId: string; discordUsername: string; discordGlobalName: string | null } | null
  _count?: { guildPermissions: number }
}

export function createAdminService(deps: AppDeps, live: LiveService, operators: OperatorService) {
  const { repos, config } = deps

  function audit(
    session: Session,
    action: string,
    target: { type: string; id: string | null; guildId?: string | null },
    metadata?: Record<string, string | number | boolean | string[]>,
  ) {
    return repos.audit.record({
      actorUserId: session.userId,
      guildId: target.guildId ?? null,
      action,
      targetType: target.type,
      targetId: target.id,
      metadata,
    })
  }

  async function suspensionOf(row: {
    suspendedAt: Date | null
    suspendedReason: string | null
    suspendedByUserId: string | null
  }): Promise<Suspension | null> {
    if (!row.suspendedAt) return null
    const by = row.suspendedByUserId ? await repos.users.findById(row.suspendedByUserId) : null
    return {
      at: row.suspendedAt.toISOString(),
      reason: row.suspendedReason ?? "",
      by: by ? { id: by.discordUserId, name: displayName(by) } : null,
    }
  }

  async function toAdminWorkers(rows: AdminWorkerRow[]): Promise<AdminWorker[]> {
    const states = await live.workers(rows.map((w) => w.id))
    return rows.map((w) => ({
      ...toApiWorker(w, states.get(w.id)),
      enabled: w.enabled,
      owner: w.owner ? { id: w.owner.discordUserId, name: displayName(w.owner) } : null,
      connections: w._count?.guildPermissions ?? 0,
      disabledEngines: w.engines.filter((e) => !e.enabled).map((e) => e.engineId),
      ...(w.type === WorkerType.OFFICIAL ? { guildScope: w.restrictedToGuilds ? "selected" : "all" } : {}),
    }))
  }

  async function workerDetail(publicId: string): Promise<AdminWorker> {
    const row = await repos.admin.workerDetail(publicId)
    const [worker] = row ? await toAdminWorkers([row]) : []
    if (!worker) throw notFound("Worker")
    return worker
  }

  async function anyWorker(publicId: string): Promise<WorkerRecord> {
    const worker = await repos.workers.findByPublicId(publicId)
    if (!worker) throw notFound("Worker")
    return worker
  }

  async function guildByDiscordId(discordGuildId: string) {
    const guild = await repos.guilds.findByDiscordId(discordGuildId)
    if (!guild) throw notFound("Guild")
    return guild
  }

  /** Bot に指示し、失敗なら 503 として返す */
  async function command(input: Parameters<AppDeps["bot"]>[0]): Promise<BotCommandResult> {
    const result = await deps.bot(input)
    if (!result.ok)
      throw new AppError("SERVICE_UNAVAILABLE", result.message ?? "The bot could not complete the request.")
    return result
  }

  async function userByDiscordId(discordUserId: string) {
    const user = await repos.admin.userDetail(discordUserId)
    if (!user) throw notFound("User")
    return user
  }

  /** 自分自身・owner は利用停止・削除できない */
  function assertTargetable(session: Session, discordUserId: string) {
    if (discordUserId === session.discordUserId) throw forbidden("You cannot perform this action on yourself.")
    if (operators.isOwner(discordUserId)) throw forbidden("Owners defined in the environment cannot be changed.")
  }

  return {
    async overview(): Promise<AdminOverview> {
      const tz = config.USAGE_TIME_ZONE
      const now = deps.now()
      const today = startOfDay(now, tz)
      const weekAgo = startOfLocalDate(addDays(localDate(now, tz), -6), tz)
      const [counts, bot, todayUsage, weekUsage, logs, workers] = await Promise.all([
        repos.admin.counts(),
        live.botHeartbeat(),
        repos.admin.usageTotals(today),
        repos.admin.usageTotals(weekAgo),
        repos.admin.auditLogs({ take: 10 }),
        deps.db.worker.findMany({ where: { deletedAt: null }, select: { id: true, type: true } }),
      ])
      // 接続数は Gateway が更新するリアルタイムの状態で数える（DB の状態は Gateway の異常終了で残ることがある）
      const states = await live.workers(workers.map((w) => w.id))
      const online = (type: WorkerType) => workers.filter((w) => w.type === type && states.has(w.id)).length
      return {
        bot: {
          status: !bot.online ? "offline" : bot.pingMs > DEGRADED_PING_MS ? "degraded" : "online",
          pingMs: bot.pingMs,
        },
        workers: {
          official: { total: counts.officialWorkers.total, online: online(WorkerType.OFFICIAL) },
          private: { total: counts.privateWorkers.total, online: online(WorkerType.PRIVATE) },
        },
        guilds: { installed: counts.installedGuilds, total: counts.totalGuilds },
        users: counts.users,
        usage: { today: todayUsage, last7Days: weekUsage },
        recentAuditLogs: logs.items.map(toAuditEntry),
      }
    },

    /* ---------- Worker（公式・自鯖） ---------- */

    async officialWorkers(): Promise<AdminWorker[]> {
      return toAdminWorkers(await repos.admin.officialWorkers())
    },

    async privateWorkers(input: {
      query?: string
      cursor?: string
      status?: "connected" | "disconnected" | "disabled"
    }): Promise<Page<AdminWorker>> {
      const page = await repos.admin.privateWorkers({ ...input, take: PAGE_SIZE })
      return { nextCursor: page.nextCursor, items: await toAdminWorkers(page.items) }
    },

    async createOfficialWorker(session: Session, input: CreateWorkerRequest): Promise<CreateWorkerResponse> {
      const publicId = generatePublicId()
      const credential = generateWorkerCredential(publicId)
      const worker = await registerWorker(deps.db, {
        publicId,
        name: input.name,
        engines: input.engines,
        secretHash: credential.secretHash,
        type: WorkerType.OFFICIAL,
        ownerUserId: null,
      })
      await audit(
        session,
        "admin.worker.create",
        { type: "worker", id: publicId },
        { name: input.name, engines: input.engines },
      )
      return { worker: toApiWorker(worker, undefined), token: credential.token }
    },

    /** Worker の詳細（公式・自鯖） */
    worker: workerDetail,

    /** 名前変更・メンテナンス（無効化 / 有効化）・エンジンの停止・公式Worker の担当サーバー */
    async updateWorker(session: Session, publicId: string, input: UpdateAdminWorkerRequest): Promise<AdminWorker> {
      let worker = await anyWorker(publicId)
      if (input.guildScope !== undefined && worker.type !== WorkerType.OFFICIAL) {
        throw validationError("Only official workers can be assigned to servers.")
      }
      if (input.name !== undefined) {
        worker = await repos.workers.rename(worker.id, input.name)
        await audit(session, "admin.worker.rename", { type: "worker", id: publicId }, { name: input.name })
      }
      if (input.enabled !== undefined && input.enabled !== worker.enabled) {
        worker = await repos.workers.setEnabled(worker.id, input.enabled)
        await audit(session, input.enabled ? "admin.worker.enable" : "admin.worker.disable", {
          type: "worker",
          id: publicId,
        })
        // 無効にしたら接続を切る（再接続しても Gateway が受け付けない）
        await live.invalidate({ kind: "worker", workerId: publicId })
      }
      if (input.disabledEngines !== undefined) {
        const current = worker.engines.filter((e) => !e.enabled).map((e) => e.engineId)
        const known = new Set(worker.engines.map((e) => e.engineId))
        const unknown = input.disabledEngines.find((e) => !known.has(e))
        if (unknown) throw validationError(`${unknown} is not provided by this worker.`)
        if (current.sort().join() !== [...input.disabledEngines].sort().join()) {
          await repos.workers.setDisabledEngines(worker.id, input.disabledEngines)
          await audit(
            session,
            "admin.worker.update_engines",
            { type: "worker", id: publicId },
            { disabledEngines: input.disabledEngines.join(",") },
          )
          // 接続中の Worker を再接続させ、Gateway が止めたエンジンを読み直す
          await live.invalidate({ kind: "worker", workerId: publicId })
        }
      }
      if (input.guildScope !== undefined && (input.guildScope === "selected") !== worker.restrictedToGuilds) {
        worker = await repos.workers.setRestrictedToGuilds(worker.id, input.guildScope === "selected")
        await audit(session, "admin.worker.update_scope", { type: "worker", id: publicId }, { scope: input.guildScope })
        // 振り分けだけを再計算する（Worker は切断しない）
        await live.invalidate({ kind: "routing" })
      }
      return workerDetail(publicId)
    },

    async regenerateToken(session: Session, publicId: string): Promise<{ token: string }> {
      const worker = await anyWorker(publicId)
      const credential = generateWorkerCredential(publicId)
      await rotateWorkerCredential(deps.db, worker.id, credential.secretHash, session.userId)
      await audit(session, "admin.worker.rotate_token", { type: "worker", id: publicId })
      await live.invalidate({ kind: "worker", workerId: publicId })
      return { token: credential.token }
    },

    async deleteWorker(session: Session, publicId: string): Promise<void> {
      const worker = await anyWorker(publicId)
      await deleteWorker(deps.db, worker.id, session.userId)
      await audit(session, "admin.worker.delete", { type: "worker", id: publicId }, { name: worker.name })
      await live.invalidate({ kind: "worker", workerId: publicId })
    },

    /** 接続を切る（有効な Worker は自動で再接続する） */
    async disconnectWorker(session: Session, publicId: string): Promise<void> {
      await anyWorker(publicId)
      await audit(session, "admin.worker.disconnect", { type: "worker", id: publicId })
      await live.invalidate({ kind: "worker", workerId: publicId })
    },

    async workerConnections(publicId: string): Promise<AdminWorkerConnection[]> {
      const worker = await anyWorker(publicId)
      return (await repos.admin.workerConnections(worker.id)).map((c) => ({
        guildId: c.guild.discordGuildId,
        guildName: c.guild.name,
        scope: scopeFromDb[c.scope],
      }))
    },

    /**
     * 接続先を置き換える。自鯖Worker は所有者がサーバーに参加しているかに関係なく設定できる。
     * 公式Worker は「担当するサーバー」（guildScope = selected のときに使う）
     */
    async updateWorkerConnections(session: Session, publicId: string, input: UpdateWorkerGuildsRequest): Promise<void> {
      const worker = await anyWorker(publicId)
      // 公式Worker は「担当するサーバー」として指定する（サーバーで共有する扱い）
      if (worker.type === WorkerType.OFFICIAL && input.connections.some((c) => c.scope !== "server")) {
        throw validationError("Official workers can only be assigned to servers.")
      }
      const guilds = await repos.guilds.findManyByDiscordIds(input.connections.map((c) => c.guildId))
      const byId = new Map(guilds.map((g) => [g.discordGuildId, g]))
      const connections = input.connections.map((c) => {
        const guild = byId.get(c.guildId)
        if (!guild) throw notFound("Guild")
        return { guildId: guild.id, scope: scopeToDb[c.scope] }
      })
      await replaceWorkerConnections(deps.db, worker.id, connections, session.userId)
      await audit(
        session,
        "admin.worker.update_connections",
        { type: "worker", id: publicId },
        { connections: input.connections.map((c) => `${c.guildId}:${c.scope}`) },
      )
      await live.invalidate({ kind: "worker", workerId: publicId })
    },

    /* ---------- サーバー ---------- */

    async guilds(input: { query?: string; cursor?: string }): Promise<Page<AdminGuild>> {
      const page = await repos.admin.guilds({ ...input, take: PAGE_SIZE })
      const ids = page.items.map((g) => g.id)
      const today = startOfDay(deps.now(), config.USAGE_TIME_ZONE)
      const [messages, lastActivity, sessions] = await Promise.all([
        repos.admin.messagesSince(ids, today),
        repos.usage.lastActivity(ids),
        live.guildSessions(page.items.map((g) => g.discordGuildId)),
      ])
      return {
        nextCursor: page.nextCursor,
        items: page.items.map((g) => ({
          id: g.discordGuildId,
          name: g.name,
          iconUrl: g.icon ? cdn.guildIcon(g.discordGuildId, g.icon) : undefined,
          memberCount: g.memberCount ?? undefined,
          botInstalled: g.botInstalled,
          suspended: g.suspendedAt !== null,
          readingStatus:
            !g.botInstalled || g.suspendedAt
              ? "disabled"
              : (sessions.get(g.discordGuildId)?.length ?? 0) > 0
                ? "active"
                : "idle",
          messagesToday: messages.get(g.id) ?? 0,
          lastActiveAt: lastActivity.get(g.id)?.toISOString(),
          createdAt: g.createdAt.toISOString(),
        })),
      }
    },

    async guildDetail(discordGuildId: string): Promise<AdminGuildDetail> {
      const guild = await repos.admin.guildDetail(discordGuildId)
      if (!guild) throw notFound("Guild")
      const tz = config.USAGE_TIME_ZONE
      const now = deps.now()
      const since = startOfLocalDate(addDays(localDate(now, tz), -29), tz)
      const settings = guild.settings ?? (await repos.guildSettings.getOrCreate(guild.id))
      const [sessions, usage, messages, lastActivity, logs, workerIds, suspension] = await Promise.all([
        live.guildSessions([discordGuildId]),
        repos.usage.summarize({ guildIds: [guild.id], since, timeZone: tz }),
        repos.admin.messagesSince([guild.id], startOfDay(now, tz)),
        repos.usage.lastActivity([guild.id]),
        repos.admin.auditLogs({ guildId: guild.id, take: 20 }),
        deps.db.worker.findMany({
          where: { publicId: { in: guild.workerPermissions.map((p) => p.worker.publicId) } },
          select: { id: true, publicId: true },
        }),
        suspensionOf(guild),
      ])
      const states = await live.workers(workerIds.map((w) => w.id))
      const liveByPublicId = new Map(workerIds.map((w) => [w.publicId, states.get(w.id)]))
      const byDate = new Map(usage.daily.map((d) => [d.date, d]))
      const guildSessions = sessions.get(discordGuildId) ?? []

      return {
        id: guild.discordGuildId,
        name: guild.name,
        iconUrl: guild.icon ? cdn.guildIcon(guild.discordGuildId, guild.icon) : undefined,
        memberCount: guild.memberCount ?? undefined,
        botInstalled: guild.botInstalled,
        suspended: suspension !== null,
        suspension,
        readingStatus: !guild.botInstalled || suspension ? "disabled" : guildSessions.length > 0 ? "active" : "idle",
        messagesToday: messages.get(guild.id) ?? 0,
        lastActiveAt: lastActivity.get(guild.id)?.toISOString(),
        createdAt: guild.createdAt.toISOString(),
        ownerId: guild.ownerDiscordUserId,
        settings: {
          readingMode: readingModeFromDb[settings.readingMode],
          workerMode: workerModeFromDb[settings.workerMode],
          fallbackToOfficial: settings.fallbackToOfficial,
          maxCharacters: settings.maxCharacters,
          voice: guildVoice(settings) ?? { ...DEFAULT_GUILD_VOICE },
        },
        workers: guild.workerPermissions.map((p) => {
          const state = liveByPublicId.get(p.worker.publicId)
          return {
            id: p.worker.publicId,
            name: p.worker.name,
            status: state
              ? state.status === "busy"
                ? "busy"
                : state.status === "degraded"
                  ? "error"
                  : "online"
              : workerStatusFromDb[p.worker.status] === "error"
                ? "error"
                : "offline",
            scope: scopeFromDb[p.scope],
            ownerName: p.worker.owner ? displayName(p.worker.owner) : undefined,
          }
        }),
        sessions: guildSessions.map((s) => ({
          textChannelName: s.textChannelName,
          voiceChannelName: s.voiceChannelName,
          connected: true,
        })),
        dictionaryEntries: guild._count.dictionaryEntries,
        usage30Days: {
          characters: usage.byGuild.reduce((sum, g) => sum + g.characters, 0),
          requests: usage.byGuild.reduce((sum, g) => sum + g.requests, 0),
          daily: dateRange(localDate(since, tz), localDate(now, tz)).map((date) => ({
            date,
            characters: byDate.get(date)?.characters ?? 0,
            requests: byDate.get(date)?.requests ?? 0,
          })),
        },
        auditLogs: logs.items.map(toAuditEntry),
      }
    },

    /** 利用停止: 読み上げを止め、サーバー管理者も設定を変更できなくする */
    async suspendGuild(session: Session, discordGuildId: string, reason: string): Promise<void> {
      const guild = await guildByDiscordId(discordGuildId)
      await repos.guilds.setSuspension(guild.id, { reason, byUserId: session.userId })
      await audit(session, "admin.guild.suspend", { type: "guild", id: guild.id, guildId: guild.id }, { reason })
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
      // 読み上げ中なら終了させる（Bot が動いていなくても利用停止は有効）
      await deps.bot({ kind: "stop-sessions", guildId: discordGuildId }).catch(() => undefined)
    },

    async unsuspendGuild(session: Session, discordGuildId: string): Promise<void> {
      const guild = await guildByDiscordId(discordGuildId)
      await repos.guilds.setSuspension(guild.id, null)
      await audit(session, "admin.guild.unsuspend", { type: "guild", id: guild.id, guildId: guild.id })
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
    },

    async stopGuildSessions(session: Session, discordGuildId: string): Promise<BotCommandResult> {
      const guild = await guildByDiscordId(discordGuildId)
      const result = await command({ kind: "stop-sessions", guildId: discordGuildId })
      await audit(session, "admin.guild.stop_sessions", { type: "guild", id: guild.id, guildId: guild.id })
      return result
    },

    /** Bot（サブボットを含む）をサーバーから退出させる */
    async leaveGuild(session: Session, discordGuildId: string, reason: string): Promise<BotCommandResult> {
      const guild = await guildByDiscordId(discordGuildId)
      const result = await command({ kind: "leave-guild", guildId: discordGuildId })
      await repos.guilds.markUninstalled(discordGuildId)
      await audit(session, "admin.guild.leave", { type: "guild", id: guild.id, guildId: guild.id }, { reason })
      return result
    },

    /** サーバーから自鯖Worker の接続を外す */
    async removeGuildWorker(session: Session, discordGuildId: string, publicId: string): Promise<void> {
      const guild = await guildByDiscordId(discordGuildId)
      const worker = await anyWorker(publicId)
      const removed = await deps.db.$transaction(async (tx) => {
        const result = await tx.workerGuildPermission.deleteMany({ where: { workerId: worker.id, guildId: guild.id } })
        await tx.guildSettings.updateMany({
          where: { guildId: guild.id, specificWorkerId: worker.id },
          data: { workerMode: WorkerMode.AUTOMATIC, specificWorkerId: null },
        })
        return result.count
      })
      if (removed === 0) throw notFound("Connection")
      await audit(session, "admin.guild.remove_worker", { type: "worker", id: publicId, guildId: guild.id })
      await live.invalidate({ kind: "worker", workerId: publicId })
    },

    /* ---------- ユーザー ---------- */

    async users(input: { query?: string; cursor?: string }): Promise<Page<AdminUser>> {
      const page = await repos.admin.users({ ...input, take: PAGE_SIZE })
      const roles = await Promise.all(page.items.map((u) => operators.roleOf(u.discordUserId)))
      return {
        nextCursor: page.nextCursor,
        items: page.items.map((u, i) => ({
          id: u.discordUserId,
          username: u.discordUsername,
          displayName: displayName(u),
          avatarUrl: u.discordAvatar ? cdn.userAvatar(u.discordUserId, u.discordAvatar) : undefined,
          privateWorkers: u._count.workers,
          hasVoice: u.voiceSettings !== null,
          isOperator: roles[i] !== null,
          suspended: u.suspendedAt !== null,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
      }
    },

    async userDetail(discordUserId: string): Promise<AdminUserDetail> {
      const user = await userByDiscordId(discordUserId)
      const [role, workers, sessions, suspension] = await Promise.all([
        operators.roleOf(discordUserId),
        repos.admin.workersOwnedBy(user.id),
        deps.sessions.countForUser(user.id),
        suspensionOf(user),
      ])
      return {
        id: user.discordUserId,
        username: user.discordUsername,
        displayName: displayName(user),
        avatarUrl: user.discordAvatar ? cdn.userAvatar(user.discordUserId, user.discordAvatar) : undefined,
        privateWorkers: workers.length,
        hasVoice: user.voiceSettings !== null,
        isOperator: role !== null,
        operatorRole: role,
        suspended: suspension !== null,
        suspension,
        voice: user.voiceSettings ? voiceFromColumns(user.voiceSettings) : null,
        workers: await toAdminWorkers(workers),
        sessions,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      }
    },

    async setUserVoice(session: Session, discordUserId: string, voice: VoiceSettings | null): Promise<void> {
      const user = await userByDiscordId(discordUserId)
      await repos.users.setVoice(user.id, voice)
      await audit(
        session,
        "admin.user.update_voice",
        { type: "user", id: discordUserId },
        { voice: voice?.engine ?? "reset" },
      )
      await live.invalidate({ kind: "user", userId: discordUserId })
    },

    /** 強制ログアウト（Web のセッションをすべて無効にする） */
    async logoutUser(session: Session, discordUserId: string): Promise<{ sessions: number }> {
      const user = await userByDiscordId(discordUserId)
      const sessions = await deps.sessions.destroyAllForUser(user.id)
      await audit(session, "admin.user.logout", { type: "user", id: discordUserId }, { sessions })
      return { sessions }
    },

    /** 利用停止: ログインできなくし、発言を読み上げない */
    async suspendUser(session: Session, discordUserId: string, reason: string): Promise<void> {
      assertTargetable(session, discordUserId)
      const user = await userByDiscordId(discordUserId)
      await repos.users.setSuspension(user.id, { reason, byUserId: session.userId })
      await deps.sessions.destroyAllForUser(user.id)
      await audit(session, "admin.user.suspend", { type: "user", id: discordUserId }, { reason })
      await live.invalidate({ kind: "user", userId: discordUserId })
    },

    async unsuspendUser(session: Session, discordUserId: string): Promise<void> {
      const user = await userByDiscordId(discordUserId)
      await repos.users.setSuspension(user.id, null)
      await audit(session, "admin.user.unsuspend", { type: "user", id: discordUserId })
      await live.invalidate({ kind: "user", userId: discordUserId })
    },

    /** データの削除（本人からの依頼など）: 自鯖Worker を削除し、ユーザーと音声設定を削除する */
    async deleteUser(session: Session, discordUserId: string, reason: string): Promise<{ deletedWorkers: number }> {
      assertTargetable(session, discordUserId)
      const user = await userByDiscordId(discordUserId)
      const workers = await repos.admin.workersOwnedBy(user.id)
      await deps.sessions.destroyAllForUser(user.id)
      const result = await deleteUserData(deps.db, user.id, { actorUserId: session.userId, reason })
      await repos.operators.delete(discordUserId)
      for (const w of workers) await live.invalidate({ kind: "worker", workerId: w.publicId })
      await live.invalidate({ kind: "user", userId: discordUserId })
      return result
    },

    /* ---------- 運営者 ---------- */

    async operatorList(): Promise<OperatorEntry[]> {
      const rows = await repos.operators.list()
      const owners = operators.owners()
      const users = await deps.db.user.findMany({
        where: { discordUserId: { in: [...owners, ...rows.map((r) => r.discordUserId)] } },
      })
      const byId = new Map(users.map((u) => [u.discordUserId, u]))
      const user = (id: string) => {
        const u = byId.get(id)
        return u
          ? {
              name: displayName(u),
              avatarUrl: u.discordAvatar ? cdn.userAvatar(u.discordUserId, u.discordAvatar) : undefined,
            }
          : null
      }
      return [
        ...owners.map((id): OperatorEntry => ({ discordUserId: id, role: "owner", source: "env", user: user(id) })),
        ...rows
          .filter((r) => !operators.isOwner(r.discordUserId))
          .map((r): OperatorEntry => ({
            discordUserId: r.discordUserId,
            role: r.role === "ADMIN" ? "admin" : r.role === "EDITOR" ? "editor" : "viewer",
            source: "web",
            user: user(r.discordUserId),
            createdAt: r.createdAt.toISOString(),
          })),
      ]
    },

    async setOperator(session: Session, discordUserId: string, role: Exclude<OperatorRole, "owner">): Promise<void> {
      if (operators.isOwner(discordUserId)) throw forbidden("Owners defined in the environment cannot be changed.")
      // 自分の権限を下げて操作できなくなるのを防ぐ
      if (discordUserId === session.discordUserId) throw forbidden("You cannot change your own role.")
      await repos.operators.upsert(
        discordUserId,
        role === "admin" ? "ADMIN" : role === "editor" ? "EDITOR" : "VIEWER",
        session.userId,
      )
      await audit(session, "admin.operator.set", { type: "operator", id: discordUserId }, { role })
    },

    async removeOperator(session: Session, discordUserId: string): Promise<void> {
      if (operators.isOwner(discordUserId)) throw forbidden("Owners defined in the environment cannot be changed.")
      if (discordUserId === session.discordUserId) throw forbidden("You cannot remove yourself.")
      if (!(await repos.operators.delete(discordUserId))) throw notFound("Operator")
      await audit(session, "admin.operator.remove", { type: "operator", id: discordUserId })
    },

    /* ---------- サービス全体 ---------- */

    async registerCommands(session: Session): Promise<BotCommandResult> {
      const result = await command({ kind: "register-commands" })
      await audit(session, "admin.system.register_commands", { type: "system", id: null })
      return result
    },

    /* ---------- 監査ログ ---------- */

    async auditLogs(query: AuditLogQuery): Promise<Page<AuditLogEntry>> {
      let guildId: string | undefined
      if (query.guildId) {
        const guild = await repos.guilds.findByDiscordId(query.guildId)
        if (!guild) return { items: [], nextCursor: null }
        guildId = guild.id
      }
      const page = await repos.admin.auditLogs({
        // 空文字は絞り込まない
        actionPrefix: query.action === "" ? undefined : query.action,
        guildId,
        cursor: query.cursor,
        take: PAGE_SIZE,
      })
      return { nextCursor: page.nextCursor, items: page.items.map(toAuditEntry) }
    },
  }
}

export type AdminService = ReturnType<typeof createAdminService>
