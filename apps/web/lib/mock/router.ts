/**
 * 仕様書 §63 の API をモックで再現するルーター。
 * サーバーコンポーネントからは直接、ブラウザからは app/api/[...path]/route.ts 経由で呼ばれる。
 */
import {
  REASON_LENGTH,
  SYSTEM_LIMIT_RANGE,
  type AdminGuild,
  type AdminGuildDetail,
  type AdminOverview,
  type AdminUser,
  type AdminUserDetail,
  type AdminWorker,
  type AdminWorkerConnection,
  type AuditLogEntry,
  type OperatorEntry,
  type OperatorLevel,
  type Suspension,
  type UpdateAdminWorkerRequest,
  type UpdateSystemSettingsRequest,
} from "@/types/admin"
import type { ApiErrorCode } from "@/types/api"
import { DICTIONARY_LENGTH, type DictionaryEntryInput } from "@/types/dictionary"
import {
  BOT_AVATAR,
  BOT_NICKNAME_LENGTH,
  MAX_CHARACTERS_RANGE,
  type Guild,
  type GuildBot,
  type GuildBotProfile,
  type GuildDetail,
  type GuildSettings,
  type UpdateGuildBotProfileRequest,
} from "@/types/guild"
import type { UsagePeriod, UsageSummary } from "@/types/usage"
import type { MemberGuild, UpdateMeRequest } from "@/types/user"
import type { VoicePreviewRequest } from "@/types/voice"
import {
  WORKER_NAME_LENGTH,
  type CreateWorkerRequest,
  type Worker,
  type UpdateWorkerGuildsRequest,
  type WorkerGuildConnection,
} from "@/types/worker"

import { botInviteUrl } from "@/lib/config"
import { createPreviewWav } from "@/lib/mock/audio"
import {
  BOT_DEFAULT_NAME,
  mockBots,
  mockSubBotGuilds,
  charactersThisMonth,
  channels,
  dailyCharacters,
  FORBIDDEN_GUILD_ID,
  memberOnlyGuilds,
  readingStatusOf,
  voices,
  adminUsers,
  type MockGuild,
  type MockWorker,
} from "@/lib/mock/data"
import { getStore } from "@/lib/mock/store"

export type MockResponse = { status: number; body: unknown }

type Params = Record<string, string>
type Handler = (ctx: { params: Params; query: URLSearchParams; body: unknown }) => MockResponse

const ok = (data: unknown, status = 200): MockResponse => ({ status, body: { data } })
const fail = (status: number, code: ApiErrorCode, message: string): MockResponse => ({
  status,
  body: { error: { code, message } },
})

const OPERATOR_LEVELS: OperatorLevel[] = ["admin", "editor", "viewer"]

const notFound = () => fail(404, "NOT_FOUND", "Resource not found.")
const forbidden = () => fail(403, "FORBIDDEN", "You do not have permission.")

function inRange(value: unknown, { min, max }: { min: number; max: number }) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max
}

/* ---------- mappers ---------- */

function toBotProfile(p: { nickname: string | null; avatarUrl: string | null }): GuildBotProfile {
  return { ...p, defaultName: BOT_DEFAULT_NAME }
}

function isValidAvatar(dataUrl: string) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m || !(BOT_AVATAR.types as readonly string[]).includes(m[1])) return false
  return Math.floor((m[2].length * 3) / 4) <= BOT_AVATAR.maxBytes
}

function guildBots(g: MockGuild): GuildBot[] {
  return mockBots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    role: bot.role,
    present: bot.role === "main" ? g.botInstalled : (mockSubBotGuilds[bot.id]?.includes(g.id) ?? false),
    inviteUrl:
      bot.role === "main"
        ? botInviteUrl(g.id)
        : `https://discord.com/oauth2/authorize?client_id=${bot.id}&scope=bot&permissions=3146752&guild_id=${g.id}&disable_guild_select=true`,
  }))
}

function subBotCount(g: MockGuild): Guild["subBots"] {
  const subs = guildBots(g).filter((b) => b.role === "sub")
  return { present: subs.filter((b) => b.present).length, total: subs.length }
}

function toGuild(g: MockGuild): Guild {
  const settings = getStore().settings.get(g.id)
  const voice = settings?.voice
  const suspended = getStore().guildSuspensions.has(g.id)
  return {
    id: g.id,
    name: g.name,
    suspended,
    memberCount: g.memberCount,
    botInstalled: g.botInstalled,
    botStatus: g.botStatus,
    readingEnabled: g.readingEnabled && !suspended,
    readingStatus: g.botInstalled ? (suspended ? "disabled" : readingStatusOf(g)) : undefined,
    voiceName: voice ? voices.find((v) => v.speakerId === voice.speakerId)?.speakerName : undefined,
    lastActiveAt: g.botInstalled
      ? new Date(Date.now() - g.lastActiveMinutesAgo * 60_000).toISOString()
      : undefined,
    subBots: g.botInstalled ? subBotCount(g) : undefined,
  }
}

function currentWorkerName(guildId: string) {
  const settings = getStore().settings.get(guildId)
  const mine = getStore().workers.filter(
    (w) => w.type === "private" && w.connections[guildId] === "server" && isUp(w)
  )
  if (!settings) return undefined
  if (settings.workerMode === "specific") {
    return getStore().workers.find((w) => w.id === settings.workerId)?.name
  }
  if (settings.workerMode === "private_preferred" && mine[0]) return mine[0].name
  return "official"
}

function enginesOf(workers: MockWorker[]) {
  return new Set(workers.flatMap((w) => w.engines.map((e) => e.engine)))
}

/** サーバーで使えるエンジン（Worker モードに従う）。設定ベースで判定し、Online かどうかは問わない */
function serverEngines(guildId: string): string[] {
  const store = getStore()
  const settings = store.settings.get(guildId)
  const official = store.workers.filter((w) => w.type === "official")
  const shared = store.workers.filter((w) => w.type === "private" && w.connections[guildId] === "server")
  const mode = settings?.workerMode ?? "auto"
  let set: Set<string>
  if (mode === "official") set = enginesOf(official)
  else if (mode === "specific") set = enginesOf(store.workers.filter((w) => w.id === settings?.workerId))
  else if (mode === "private_preferred" && !settings?.fallbackToOfficial) set = enginesOf(shared)
  else set = enginesOf([...official, ...shared])
  return [...set].sort()
}

/** 自分のメッセージで使えるエンジン = サーバーのエンジン + 自分専用で接続した Worker */
function myEngines(guildId: string): string[] {
  const personal = getStore().workers.filter((w) => w.type === "private" && w.connections[guildId] === "personal")
  return [...new Set([...serverEngines(guildId), ...enginesOf(personal)])].sort()
}

/** 参加している Bot 導入済みのサーバー（管理しているもの + 参加しているだけのもの） */
function memberGuilds(): { id: string; name: string; canManage: boolean }[] {
  return [
    ...getStore()
      .guilds.filter((g) => g.botInstalled && g.id !== FORBIDDEN_GUILD_ID)
      .map((g) => ({ id: g.id, name: g.name, canManage: true })),
    ...memberOnlyGuilds.map((g) => ({ ...g, canManage: false })),
  ]
}

function isUp(w: MockWorker) {
  return w.status === "online" || w.status === "busy"
}

/** 登録直後の Worker を一定時間後に接続済みにする */
function tick(w: MockWorker) {
  if (w.connectsAt && Date.now() >= w.connectsAt) {
    w.status = "online"
    w.latency = 15
    w.lastSeenSecondsAgo = 1
    w.engines = w.engines.map((e) => ({ ...e, status: "healthy", version: e.version ?? "latest" }))
    w.connectsAt = undefined
  }
}

function toWorker(w: MockWorker): Worker {
  tick(w)
  // Online の Worker は「数秒前」に通信したことにする
  const secondsAgo = isUp(w) ? Math.floor(Math.random() * 5) + 1 : w.lastSeenSecondsAgo
  const jitter = isUp(w) ? Math.round((Math.random() - 0.5) * 4) : 0
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    status: w.status,
    engines: w.engines,
    runningJobs: isUp(w) ? Math.max(0, Math.min(w.maxConcurrency, w.runningJobs + (Math.random() < 0.3 ? 1 : 0))) : 0,
    maxConcurrency: w.maxConcurrency,
    latency: w.latency !== undefined ? w.latency + jitter : undefined,
    lastSeenAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    queue: w.queue,
    createdAt: w.createdAt,
  }
}

function findGuild(id: string) {
  return getStore().guilds.find((g) => g.id === id)
}

function findPrivateWorker(id: string) {
  // 公式Worker の詳細は公開しない
  return getStore().workers.find((w) => w.id === id && w.type === "private")
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `wkr_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}

function usage(period: UsagePeriod): UsageSummary {
  const days = period === "today" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 8
  const today = new Date()
  const daily = dailyCharacters.slice(-days).map((characters, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (days - 1 - i))
    return {
      date: d.toISOString().slice(0, 10),
      characters,
      requests: Math.round(characters / 25.7),
    }
  })
  const characters = period === "month" ? charactersThisMonth : daily.reduce((s, d) => s + d.characters, 0)
  const requests = Math.round(characters / 25.7)
  const shares: [string, number][] = [
    ["1029384756", 0.38],
    ["1122334455", 0.24],
    ["2233445566", 0.19],
    ["3344556677", 0.11],
    ["4455667788", 0.08],
  ]
  return {
    period,
    characters,
    requests,
    officialWorkerCharacters: Math.round(characters * 0.77),
    privateWorkerCharacters: characters - Math.round(characters * 0.77),
    daily,
    byGuild: shares.map(([guildId, share]) => {
      const c = Math.round(characters * share)
      return {
        guildId,
        guildName: findGuild(guildId)?.name ?? guildId,
        characters: c,
        requests: Math.round(c / 25.7),
      }
    }),
  }
}

/* ---------- 運営コンソール ---------- */

function recordAudit(action: string, targetType: string, targetId: string | null, extra: { guildId?: string; metadata?: unknown } = {}) {
  const user = getStore().user
  const guild = extra.guildId ? findGuild(extra.guildId) : undefined
  getStore().auditLogs.unshift({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    action,
    actor: { id: user.id, name: user.displayName },
    guild: guild ? { id: guild.id, name: guild.name } : null,
    targetType,
    targetId,
    metadata: extra.metadata ?? null,
    createdAt: new Date().toISOString(),
  })
}

function suspensionNow(reason: string): Suspension {
  const user = getStore().user
  return { at: new Date().toISOString(), reason, by: { id: user.id, name: user.displayName } }
}

/** 理由（1〜500 文字）を取り出す。不正なら null */
function reasonOf(body: unknown): string | null {
  const reason = (body as { reason?: unknown } | undefined)?.reason
  return inRange(reason, REASON_LENGTH) ? (reason as string).trim() : null
}

const invalidReason = () => fail(400, "VALIDATION_ERROR", "reason must be 1-500 characters.")

function toAdminGuild(g: MockGuild): AdminGuild {
  const suspended = getStore().guildSuspensions.has(g.id)
  return {
    id: g.id,
    name: g.name,
    suspended,
    memberCount: g.memberCount,
    botInstalled: g.botInstalled,
    readingStatus: g.botInstalled && !suspended ? readingStatusOf(g) : "disabled",
    messagesToday: g.messagesReadToday,
    lastActiveAt: g.botInstalled ? new Date(Date.now() - g.lastActiveMinutesAgo * 60_000).toISOString() : undefined,
    createdAt: new Date(Date.now() - 86_400_000 * 60).toISOString(),
  }
}

function toAdminWorker(w: MockWorker): AdminWorker {
  const store = getStore()
  const enabled = !store.disabledWorkers.has(w.id)
  const base = toWorker(w)
  return {
    ...base,
    status: enabled ? base.status : "offline",
    enabled,
    owner: w.type === "private" ? { id: store.user.id, name: store.user.displayName } : null,
    connections: Object.keys(w.connections).length,
  }
}

function findAnyWorker(id: string) {
  return getStore().workers.find((w) => w.id === id)
}

function liveUsers() {
  const store = getStore()
  return adminUsers.filter((u) => !store.users.get(u.id)?.deleted)
}

const operatorIds = () => new Set([getStore().user.id, ...getStore().operators.map((o) => o.discordUserId)])

function toAdminUser(u: (typeof adminUsers)[number]): AdminUser {
  const state = getStore().users.get(u.id)
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    privateWorkers: u.privateWorkers,
    hasVoice: Boolean(state?.voice),
    isOperator: operatorIds().has(u.id),
    suspended: Boolean(state?.suspension),
    createdAt: new Date(Date.now() - u.daysAgo * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - Math.min(u.daysAgo, 1) * 3_600_000).toISOString(),
  }
}

/** 本人・owner は利用停止・削除できない */
function protectedUser(userId: string) {
  return userId === getStore().user.id
}

function guildRemoval(guildId: string) {
  const g = findGuild(guildId)
  if (!g) return null
  g.connected = false
  return g
}

const adminRoutes: [method: string, pattern: string, handler: Handler][] = [
  [
    "GET",
    "/api/admin/overview",
    () => {
      const { workers, guilds, auditLogs } = getStore()
      const count = (type: MockWorker["type"]) => ({
        total: workers.filter((w) => w.type === type).length,
        online: workers.filter((w) => w.type === type && isUp(w)).length,
      })
      const today = dailyCharacters.at(-1) ?? 0
      const week = dailyCharacters.slice(-7).reduce((a, b) => a + b, 0)
      const totals = (characters: number) => ({
        characters,
        requests: Math.round(characters / 25.7),
        officialCharacters: Math.round(characters * 0.77),
        privateCharacters: characters - Math.round(characters * 0.77),
      })
      const overview: AdminOverview = {
        bot: { status: "online", pingMs: 42 },
        workers: { official: count("official"), private: count("private") },
        guilds: { installed: guilds.filter((g) => g.botInstalled).length, total: guilds.length },
        users: liveUsers().length,
        usage: { today: totals(today), last7Days: totals(week) },
        recentAuditLogs: auditLogs.slice(0, 10),
      }
      return ok(overview)
    },
  ],

  /* Worker */
  [
    "GET",
    "/api/admin/workers",
    () => ok(getStore().workers.filter((w) => w.type === "official").map(toAdminWorker)),
  ],
  [
    "GET",
    "/api/admin/private-workers",
    ({ query }) => {
      const q = query.get("query")?.trim().toLowerCase() ?? ""
      const status = query.get("status")
      const items = getStore()
        .workers.filter((w) => w.type === "private")
        .map(toAdminWorker)
        .filter((w) => !q || w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || w.owner?.name.includes(q))
        .filter((w) => {
          if (status === "disabled") return !w.enabled
          if (status === "connected") return w.enabled && w.status !== "offline"
          if (status === "disconnected") return w.enabled && w.status === "offline"
          return true
        })
      return ok({ items, nextCursor: null })
    },
  ],
  [
    "POST",
    "/api/admin/workers",
    ({ body }) => {
      const input = body as CreateWorkerRequest
      if (!inRange(input.name, WORKER_NAME_LENGTH) || !Array.isArray(input.engines) || input.engines.length === 0) {
        return fail(400, "VALIDATION_ERROR", "Name and engines are required.")
      }
      const worker: MockWorker = {
        id: `wrk_official_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
        name: input.name.trim(),
        type: "official",
        status: "offline",
        engines: input.engines.map((engine) => ({ engine, status: "unhealthy" })),
        runningJobs: 0,
        maxConcurrency: 16,
        queue: 0,
        lastSeenSecondsAgo: 0,
        createdAt: new Date().toISOString(),
        connections: {},
        connectsAt: Date.now() + 20_000,
      }
      getStore().workers.push(worker)
      recordAudit("admin.worker.create", "worker", worker.id)
      return ok({ worker: toWorker(worker), token: newToken() }, 201)
    },
  ],
  [
    "PATCH",
    "/api/admin/workers/:workerId",
    ({ params, body }) => {
      const worker = findAnyWorker(params.workerId)
      if (!worker) return notFound()
      const { name, enabled } = (body ?? {}) as UpdateAdminWorkerRequest
      if (name === undefined && enabled === undefined) return fail(400, "VALIDATION_ERROR", "Nothing to update.")
      if (name !== undefined) {
        if (!inRange(name, WORKER_NAME_LENGTH)) return fail(400, "VALIDATION_ERROR", "Worker name must be 1-64 characters.")
        worker.name = name.trim()
        recordAudit("admin.worker.rename", "worker", worker.id)
      }
      if (enabled !== undefined) {
        const disabled = getStore().disabledWorkers
        if (enabled) disabled.delete(worker.id)
        else disabled.add(worker.id)
        recordAudit(enabled ? "admin.worker.enable" : "admin.worker.disable", "worker", worker.id)
      }
      return ok(toAdminWorker(worker))
    },
  ],
  [
    "POST",
    "/api/admin/workers/:workerId/regenerate-token",
    ({ params }) => {
      if (!findAnyWorker(params.workerId)) return notFound()
      recordAudit("admin.worker.rotate_token", "worker", params.workerId)
      return ok({ token: newToken() })
    },
  ],
  [
    "POST",
    "/api/admin/workers/:workerId/disconnect",
    ({ params }) => {
      if (!findAnyWorker(params.workerId)) return notFound()
      recordAudit("admin.worker.disconnect", "worker", params.workerId)
      return ok(null)
    },
  ],
  [
    "DELETE",
    "/api/admin/workers/:workerId",
    ({ params }) => {
      const store = getStore()
      const index = store.workers.findIndex((w) => w.id === params.workerId)
      if (index < 0) return notFound()
      store.workers.splice(index, 1)
      recordAudit("admin.worker.delete", "worker", params.workerId)
      return ok(null)
    },
  ],
  [
    "GET",
    "/api/admin/workers/:workerId/connections",
    ({ params }) => {
      const worker = findAnyWorker(params.workerId)
      if (!worker) return notFound()
      const items: AdminWorkerConnection[] = Object.entries(worker.connections).map(([guildId, scope]) => ({
        guildId,
        guildName: findGuild(guildId)?.name ?? guildId,
        scope,
      }))
      return ok(items)
    },
  ],
  [
    "PUT",
    "/api/admin/workers/:workerId/connections",
    ({ params, body }) => {
      const worker = findAnyWorker(params.workerId)
      if (!worker) return notFound()
      if (worker.type === "official") return fail(400, "VALIDATION_ERROR", "Official workers are available to all servers.")
      const { connections } = body as UpdateWorkerGuildsRequest
      if (connections.some((c) => !findGuild(c.guildId))) return notFound()
      worker.connections = Object.fromEntries(connections.map((c) => [c.guildId, c.scope]))
      recordAudit("admin.worker.update_connections", "worker", worker.id)
      return ok(null)
    },
  ],

  /* サーバー */
  [
    "GET",
    "/api/admin/guilds",
    ({ query }) => {
      const q = query.get("query")?.trim().toLowerCase() ?? ""
      const items = getStore()
        .guilds.filter((g) => !q || g.name.toLowerCase().includes(q) || g.id.startsWith(q))
        .map(toAdminGuild)
      return ok({ items, nextCursor: null })
    },
  ],
  [
    "GET",
    "/api/admin/guilds/:guildId",
    ({ params }) => {
      const g = findGuild(params.guildId)
      if (!g) return notFound()
      const settings = getStore().settings.get(g.id)
      const detail: AdminGuildDetail = {
        ...toAdminGuild(g),
        suspension: getStore().guildSuspensions.get(g.id) ?? null,
        ownerId: "412345678901234567",
        settings: {
          readingMode: settings?.readingMode ?? "command",
          workerMode: settings?.workerMode ?? "auto",
          fallbackToOfficial: settings?.fallbackToOfficial ?? true,
          maxCharacters: settings?.maxCharacters ?? 200,
          voice: settings?.voice ?? getStore().system.newGuildDefaults.voice,
        },
        workers: getStore()
          .workers.filter((w) => w.type === "private" && w.connections[g.id])
          .map((w) => ({
            id: w.id,
            name: w.name,
            status: w.status,
            scope: w.connections[g.id] ?? "server",
            ownerName: getStore().user.displayName,
          })),
        sessions: g.connected
          ? [{ textChannelName: g.textChannelName ?? "", voiceChannelName: g.voiceChannelName ?? "", connected: true }]
          : [],
        dictionaryEntries: getStore().dictionary.get(g.id)?.length ?? 0,
        usage30Days: (() => {
          const summary = usage("30d")
          const share = summary.byGuild.find((b) => b.guildId === g.id)?.characters ?? 0
          const ratio = summary.characters > 0 ? share / summary.characters : 0
          return {
            characters: share,
            requests: Math.round(share / 25.7),
            daily: summary.daily.map((d) => ({
              date: d.date,
              characters: Math.round(d.characters * ratio),
              requests: Math.round(d.requests * ratio),
            })),
          }
        })(),
        auditLogs: getStore().auditLogs.filter((l) => l.guild?.id === g.id),
      }
      return ok(detail)
    },
  ],
  [
    "POST",
    "/api/admin/guilds/:guildId/suspend",
    ({ params, body }) => {
      const reason = reasonOf(body)
      if (!reason) return invalidReason()
      if (!guildRemoval(params.guildId)) return notFound()
      getStore().guildSuspensions.set(params.guildId, suspensionNow(reason))
      recordAudit("admin.guild.suspend", "guild", params.guildId, { guildId: params.guildId, metadata: { reason } })
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/admin/guilds/:guildId/unsuspend",
    ({ params }) => {
      if (!findGuild(params.guildId)) return notFound()
      getStore().guildSuspensions.delete(params.guildId)
      recordAudit("admin.guild.unsuspend", "guild", params.guildId, { guildId: params.guildId })
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/admin/guilds/:guildId/stop-sessions",
    ({ params }) => {
      if (!guildRemoval(params.guildId)) return notFound()
      recordAudit("admin.guild.stop_sessions", "guild", params.guildId, { guildId: params.guildId })
      return ok({ ok: true })
    },
  ],
  [
    "POST",
    "/api/admin/guilds/:guildId/leave",
    ({ params, body }) => {
      const reason = reasonOf(body)
      if (!reason) return invalidReason()
      const g = guildRemoval(params.guildId)
      if (!g) return notFound()
      g.botInstalled = false
      recordAudit("admin.guild.leave", "guild", params.guildId, { guildId: params.guildId, metadata: { reason } })
      return ok({ ok: true })
    },
  ],
  [
    "DELETE",
    "/api/admin/guilds/:guildId/workers/:workerId",
    ({ params }) => {
      const worker = findAnyWorker(params.workerId)
      if (!findGuild(params.guildId) || !worker?.connections[params.guildId]) return notFound()
      delete worker.connections[params.guildId]
      recordAudit("admin.guild.remove_worker", "worker", worker.id, { guildId: params.guildId })
      return ok(null)
    },
  ],

  /* ユーザー */
  [
    "GET",
    "/api/admin/users",
    ({ query }) => {
      const q = query.get("query")?.trim().toLowerCase() ?? ""
      const items: AdminUser[] = liveUsers()
        .filter((u) => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q) || u.id.startsWith(q))
        .map(toAdminUser)
      return ok({ items, nextCursor: null })
    },
  ],
  [
    "GET",
    "/api/admin/users/:userId",
    ({ params }) => {
      const u = liveUsers().find((x) => x.id === params.userId)
      const state = getStore().users.get(params.userId)
      if (!u || !state) return notFound()
      const operator = getStore().operators.find((o) => o.discordUserId === u.id)
      const detail: AdminUserDetail = {
        ...toAdminUser(u),
        operatorRole: u.id === getStore().user.id ? "owner" : (operator?.role ?? null),
        suspension: state.suspension,
        voice: state.voice,
        // モックの自鯖Worker はすべてログイン中のユーザーのもの
        workers: u.id === getStore().user.id ? getStore().workers.filter((w) => w.type === "private").map(toAdminWorker) : [],
        sessions: state.sessions,
      }
      return ok(detail)
    },
  ],
  [
    "PUT",
    "/api/admin/users/:userId/voice",
    ({ params, body }) => {
      const state = getStore().users.get(params.userId)
      if (!state || state.deleted) return notFound()
      const { voice } = body as UpdateMeRequest
      if (voice === undefined || (voice !== null && !voice.speakerId)) {
        return fail(400, "VALIDATION_ERROR", "voice must be a voice setting or null.")
      }
      state.voice = voice
      recordAudit("admin.user.voice", "user", params.userId)
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/admin/users/:userId/logout",
    ({ params }) => {
      const state = getStore().users.get(params.userId)
      if (!state || state.deleted) return notFound()
      const sessions = state.sessions
      state.sessions = 0
      recordAudit("admin.user.logout", "user", params.userId, { metadata: { sessions } })
      return ok({ sessions })
    },
  ],
  [
    "POST",
    "/api/admin/users/:userId/suspend",
    ({ params, body }) => {
      const reason = reasonOf(body)
      if (!reason) return invalidReason()
      const state = getStore().users.get(params.userId)
      if (!state || state.deleted) return notFound()
      if (protectedUser(params.userId)) return fail(403, "FORBIDDEN", "You cannot suspend this user.")
      state.suspension = suspensionNow(reason)
      state.sessions = 0
      recordAudit("admin.user.suspend", "user", params.userId, { metadata: { reason } })
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/admin/users/:userId/unsuspend",
    ({ params }) => {
      const state = getStore().users.get(params.userId)
      if (!state || state.deleted) return notFound()
      state.suspension = null
      recordAudit("admin.user.unsuspend", "user", params.userId)
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/admin/users/:userId/delete",
    ({ params, body }) => {
      const reason = reasonOf(body)
      if (!reason) return invalidReason()
      const state = getStore().users.get(params.userId)
      if (!state || state.deleted) return notFound()
      if (protectedUser(params.userId)) return fail(403, "FORBIDDEN", "You cannot delete this user.")
      state.deleted = true
      getStore().operators = getStore().operators.filter((o) => o.discordUserId !== params.userId)
      recordAudit("admin.user.delete", "user", params.userId, { metadata: { reason, deletedWorkers: 0 } })
      return ok({ deletedWorkers: 0 })
    },
  ],

  /* サービス全体の設定 */
  ["GET", "/api/admin/system", () => ok(getStore().system)],
  [
    "PATCH",
    "/api/admin/system",
    ({ body }) => {
      const input = (body ?? {}) as UpdateSystemSettingsRequest
      const store = getStore()
      const limits = { ...store.system.limits, ...input.limits }
      const defaults = { ...store.system.newGuildDefaults, ...input.newGuildDefaults }
      const inside = (v: number, r: { min: number; max: number }) => Number.isInteger(v) && v >= r.min && v <= r.max
      if (
        !inside(limits.maxWorkersPerUser, SYSTEM_LIMIT_RANGE.maxWorkersPerUser) ||
        !inside(limits.dictionaryMaxEntries, SYSTEM_LIMIT_RANGE.dictionaryMaxEntries) ||
        !inside(limits.maxCharactersLimit, SYSTEM_LIMIT_RANGE.maxCharactersLimit) ||
        !inside(defaults.maxCharacters, MAX_CHARACTERS_RANGE)
      ) {
        return fail(400, "VALIDATION_ERROR", "A value is out of range.")
      }
      if (defaults.maxCharacters > limits.maxCharactersLimit) {
        return fail(400, "VALIDATION_ERROR", "The default max characters exceeds the limit.")
      }
      if (input.announcement && !inRange(input.announcement.message, REASON_LENGTH)) {
        return fail(400, "VALIDATION_ERROR", "The announcement must be 1-500 characters.")
      }
      store.system = {
        limits,
        newGuildDefaults: defaults,
        readingPaused: input.readingPaused ?? store.system.readingPaused,
        announcement:
          input.announcement === undefined
            ? store.system.announcement
            : input.announcement && { ...input.announcement, message: input.announcement.message.trim() },
        updatedAt: new Date().toISOString(),
      }
      recordAudit("admin.system.update", "system", null, { metadata: { fields: Object.keys(input) } })
      return ok(store.system)
    },
  ],
  [
    "POST",
    "/api/admin/system/register-commands",
    () => {
      recordAudit("admin.system.register_commands", "system", null)
      return ok({ ok: true, message: "5 command(s) registered" })
    },
  ],

  /* 運営者 */
  [
    "GET",
    "/api/admin/operators",
    () => {
      const owner = getStore().user
      const items: OperatorEntry[] = [
        { discordUserId: owner.id, role: "owner", source: "env", user: { name: owner.displayName } },
        ...getStore().operators,
      ]
      return ok(items)
    },
  ],
  [
    "POST",
    "/api/admin/operators",
    ({ body }) => {
      const { discordUserId, role } = body as { discordUserId?: string; role?: string }
      if (!discordUserId || !/^\d{17,20}$/.test(discordUserId) || !OPERATOR_LEVELS.includes(role as OperatorLevel)) {
        return fail(400, "VALIDATION_ERROR", "discordUserId and role are required.")
      }
      if (discordUserId === getStore().user.id) return fail(403, "FORBIDDEN", "Owners cannot be changed from the web.")
      const store = getStore()
      const known = adminUsers.find((u) => u.id === discordUserId)
      store.operators = [
        ...store.operators.filter((o) => o.discordUserId !== discordUserId),
        {
          discordUserId,
          role: role as OperatorLevel,
          source: "web",
          user: known ? { name: known.displayName } : null,
          createdAt: new Date().toISOString(),
        },
      ]
      recordAudit("admin.operator.set", "user", discordUserId, { metadata: { role } })
      return ok(null, 201)
    },
  ],
  [
    "PATCH",
    "/api/admin/operators/:userId",
    ({ params, body }) => {
      const { role } = body as { role?: string }
      if (!OPERATOR_LEVELS.includes(role as OperatorLevel)) return fail(400, "VALIDATION_ERROR", "Invalid role.")
      if (params.userId === getStore().user.id) return fail(403, "FORBIDDEN", "Owners cannot be changed from the web.")
      const operator = getStore().operators.find((o) => o.discordUserId === params.userId)
      if (!operator) return notFound()
      operator.role = role as OperatorLevel
      recordAudit("admin.operator.set", "user", params.userId, { metadata: { role } })
      return ok(null)
    },
  ],
  [
    "DELETE",
    "/api/admin/operators/:userId",
    ({ params }) => {
      if (params.userId === getStore().user.id) return fail(403, "FORBIDDEN", "Owners cannot be changed from the web.")
      const store = getStore()
      if (!store.operators.some((o) => o.discordUserId === params.userId)) return notFound()
      store.operators = store.operators.filter((o) => o.discordUserId !== params.userId)
      recordAudit("admin.operator.remove", "user", params.userId)
      return ok(null)
    },
  ],
  [
    "GET",
    "/api/admin/audit-logs",
    ({ query }) => {
      const action = query.get("action") ?? ""
      const guildId = query.get("guildId")
      const items: AuditLogEntry[] = getStore().auditLogs.filter(
        (l) => l.action.startsWith(action) && (!guildId || l.guild?.id === guildId)
      )
      return ok({ items, nextCursor: null })
    },
  ],
]

/* ---------- routes ---------- */

const routes: [method: string, pattern: string, handler: Handler][] = [
  ...adminRoutes,
  ["GET", "/api/me", () => ok(getStore().user)],
  [
    "PATCH",
    "/api/me",
    ({ body }) => {
      const { voice } = body as UpdateMeRequest
      if (voice === undefined || (voice !== null && !voice.speakerId)) {
        return fail(400, "VALIDATION_ERROR", "voice must be a voice setting or null.")
      }
      getStore().user.voice = voice
      return ok(getStore().user)
    },
  ],
  [
    "GET",
    "/api/me/guilds",
    () =>
      ok(
        memberGuilds().map(
          (g): MemberGuild => ({ id: g.id, name: g.name, canManage: g.canManage, availableEngines: myEngines(g.id) })
        )
      ),
  ],
  [
    "GET",
    "/api/status",
    () =>
      ok({
        bot: "online",
        gatewayLatencyMs: 38 + Math.round(Math.random() * 10),
        announcement: getStore().system.announcement,
        readingPaused: getStore().system.readingPaused,
      }),
  ],

  /* Guilds */
  [
    "GET",
    "/api/guilds",
    () =>
      ok(
        getStore()
          .guilds.map(toGuild)
          .sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? ""))
      ),
  ],
  [
    "GET",
    "/api/guilds/:guildId",
    ({ params }) => {
      const g = findGuild(params.guildId)
      if (!g) return notFound()
      const detail: GuildDetail = {
        ...toGuild(g),
        session: g.connected
          ? { textChannelName: g.textChannelName ?? "", voiceChannelName: g.voiceChannelName ?? "", connected: true }
          : undefined,
        currentWorkerName: g.botInstalled ? currentWorkerName(g.id) : undefined,
        messagesReadToday: g.messagesReadToday,
        availableEngines: g.botInstalled ? serverEngines(g.id) : [],
        bots: guildBots(g),
      }
      return ok(detail)
    },
  ],
  [
    "GET",
    "/api/guilds/:guildId/channels",
    ({ params }) => (findGuild(params.guildId) ? ok(channels) : notFound()),
  ],
  [
    "GET",
    "/api/guilds/:guildId/settings",
    ({ params }) => {
      const s = getStore().settings.get(params.guildId)
      return s ? ok(s) : notFound()
    },
  ],
  [
    "PATCH",
    "/api/guilds/:guildId/settings",
    ({ params, body }) => {
      const current = getStore().settings.get(params.guildId)
      if (!current) return notFound()
      const patch = body as Partial<GuildSettings>
      if (
        patch.maxCharacters !== undefined &&
        (!Number.isInteger(patch.maxCharacters) ||
          patch.maxCharacters < MAX_CHARACTERS_RANGE.min ||
          patch.maxCharacters > MAX_CHARACTERS_RANGE.max)
      ) {
        return fail(400, "VALIDATION_ERROR", "maxCharacters must be between 1 and 1000.")
      }
      if (patch.workerMode === "specific" && !patch.workerId && !current.workerId) {
        return fail(400, "VALIDATION_ERROR", "workerId is required for specific mode.")
      }
      if (patch.voice === null) return fail(400, "VALIDATION_ERROR", "voice is required.")
      if (patch.readingMode !== undefined && patch.readingMode !== "command" && patch.readingMode !== "fixed") {
        return fail(400, "VALIDATION_ERROR", "readingMode must be command or fixed.")
      }
      const next = { ...current, ...patch }
      if (next.readingMode === "fixed" && (!next.textChannelId || !next.voiceChannelId)) {
        return fail(400, "VALIDATION_ERROR", "textChannelId and voiceChannelId are required for fixed mode.")
      }
      getStore().settings.set(params.guildId, next)
      return ok(next)
    },
  ],

  /* Bot Profile（仕様書 §63 に無い API） */
  [
    "GET",
    "/api/guilds/:guildId/bot-profile",
    ({ params }) => {
      const p = getStore().botProfiles.get(params.guildId)
      return p ? ok(toBotProfile(p)) : notFound()
    },
  ],
  [
    "PATCH",
    "/api/guilds/:guildId/bot-profile",
    ({ params, body }) => {
      const current = getStore().botProfiles.get(params.guildId)
      if (!current) return notFound()
      const patch = body as UpdateGuildBotProfileRequest
      if (patch.nickname != null && !inRange(patch.nickname, BOT_NICKNAME_LENGTH)) {
        return fail(400, "VALIDATION_ERROR", "nickname must be 1-32 characters.")
      }
      if (patch.avatar != null && !isValidAvatar(patch.avatar)) {
        return fail(400, "VALIDATION_ERROR", "avatar must be a PNG / JPEG / GIF / WebP image up to 4MB.")
      }
      const next = {
        nickname: patch.nickname === undefined ? current.nickname : patch.nickname?.trim() || null,
        avatarUrl: patch.avatar === undefined ? current.avatarUrl : patch.avatar,
      }
      getStore().botProfiles.set(params.guildId, next)
      return ok(toBotProfile(next))
    },
  ],

  [
    "GET",
    "/api/guilds/:guildId/workers",
    ({ params }) =>
      findGuild(params.guildId)
        ? ok(
            getStore()
              .workers.filter((w) => w.type === "private" && w.connections[params.guildId] === "server")
              .map(toWorker),
          )
        : notFound(),
  ],

  /* Dictionary */
  [
    "GET",
    "/api/guilds/:guildId/dictionary",
    ({ params }) => {
      const list = getStore().dictionary.get(params.guildId)
      return list ? ok(list) : notFound()
    },
  ],
  [
    "POST",
    "/api/guilds/:guildId/dictionary",
    ({ params, body }) => {
      const list = getStore().dictionary.get(params.guildId)
      if (!list) return notFound()
      const input = body as DictionaryEntryInput
      if (!inRange(input.word, DICTIONARY_LENGTH.word) || !inRange(input.reading, DICTIONARY_LENGTH.reading)) {
        return fail(400, "VALIDATION_ERROR", "Invalid dictionary entry.")
      }
      if (list.some((e) => e.word === input.word.trim())) {
        return fail(409, "CONFLICT", "The word already exists.")
      }
      const entry = {
        id: `dict_${crypto.randomUUID()}`,
        word: input.word.trim(),
        reading: input.reading.trim(),
        createdAt: new Date().toISOString(),
      }
      list.unshift(entry)
      return ok(entry, 201)
    },
  ],
  [
    "PATCH",
    "/api/guilds/:guildId/dictionary/:entryId",
    ({ params, body }) => {
      const list = getStore().dictionary.get(params.guildId)
      const entry = list?.find((e) => e.id === params.entryId)
      if (!list || !entry) return notFound()
      const input = body as DictionaryEntryInput
      if (!inRange(input.word, DICTIONARY_LENGTH.word) || !inRange(input.reading, DICTIONARY_LENGTH.reading)) {
        return fail(400, "VALIDATION_ERROR", "Invalid dictionary entry.")
      }
      if (list.some((e) => e.id !== entry.id && e.word === input.word.trim())) {
        return fail(409, "CONFLICT", "The word already exists.")
      }
      entry.word = input.word.trim()
      entry.reading = input.reading.trim()
      return ok(entry)
    },
  ],
  [
    "DELETE",
    "/api/guilds/:guildId/dictionary/:entryId",
    ({ params }) => {
      const list = getStore().dictionary.get(params.guildId)
      const index = list?.findIndex((e) => e.id === params.entryId) ?? -1
      if (!list || index < 0) return notFound()
      list.splice(index, 1)
      return ok(null)
    },
  ],

  /* Workers */
  ["GET", "/api/workers", () => ok(getStore().workers.map(toWorker))],
  [
    "POST",
    "/api/workers",
    ({ body }) => {
      const input = body as CreateWorkerRequest
      if (!inRange(input.name, WORKER_NAME_LENGTH)) {
        return fail(400, "VALIDATION_ERROR", "Worker name must be 1-64 characters.")
      }
      if (!Array.isArray(input.engines) || input.engines.length === 0) {
        return fail(400, "VALIDATION_ERROR", "Select at least one engine.")
      }
      const worker: MockWorker = {
        id: `wrk_01H${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
        name: input.name.trim(),
        type: "private",
        status: "offline",
        engines: input.engines.map((engine) => ({ engine, status: "unhealthy" })),
        runningJobs: 0,
        maxConcurrency: 4,
        queue: 0,
        lastSeenSecondsAgo: 0,
        createdAt: new Date().toISOString(),
        connections: {},
        // セットアップ手順を読む時間を見込んで、作成から 20 秒後に接続したことにする
        connectsAt: Date.now() + 20_000,
      }
      getStore().workers.push(worker)
      return ok({ worker: toWorker(worker), token: newToken() }, 201)
    },
  ],
  [
    "GET",
    "/api/workers/:workerId",
    ({ params }) => {
      const w = findPrivateWorker(params.workerId)
      return w ? ok(toWorker(w)) : notFound()
    },
  ],
  [
    "PATCH",
    "/api/workers/:workerId",
    ({ params, body }) => {
      const w = findPrivateWorker(params.workerId)
      if (!w) return notFound()
      const { name } = body as { name?: string }
      if (name !== undefined) {
        if (!inRange(name, WORKER_NAME_LENGTH)) {
          return fail(400, "VALIDATION_ERROR", "Worker name must be 1-64 characters.")
        }
        w.name = name.trim()
      }
      return ok(toWorker(w))
    },
  ],
  [
    "DELETE",
    "/api/workers/:workerId",
    ({ params }) => {
      const store = getStore()
      const w = findPrivateWorker(params.workerId)
      if (!w) return notFound()
      store.workers = store.workers.filter((x) => x.id !== w.id)
      // このWorkerを指定していたサーバーは自動選択に戻す
      for (const [guildId, s] of store.settings) {
        if (s.workerId === w.id) store.settings.set(guildId, { ...s, workerMode: "auto", workerId: undefined })
      }
      return ok(null)
    },
  ],
  [
    "POST",
    "/api/workers/:workerId/regenerate-token",
    ({ params }) => (findPrivateWorker(params.workerId) ? ok({ token: newToken() }) : notFound()),
  ],
  [
    "GET",
    "/api/workers/:workerId/guilds",
    ({ params }) => {
      const w = findPrivateWorker(params.workerId)
      if (!w) return notFound()
      const list: WorkerGuildConnection[] = memberGuilds().map((g) => ({
        guildId: g.id,
        guildName: g.name,
        canManage: g.canManage,
        scope: w.connections[g.id] ?? "none",
      }))
      return ok(list)
    },
  ],
  [
    "PUT",
    "/api/workers/:workerId/guilds",
    ({ params, body }) => {
      const w = findPrivateWorker(params.workerId)
      if (!w) return notFound()
      const { connections } = body as UpdateWorkerGuildsRequest
      if (!Array.isArray(connections)) return fail(400, "VALIDATION_ERROR", "connections is required.")
      const guilds = new Map(memberGuilds().map((g) => [g.id, g]))
      const next: MockWorker["connections"] = {}
      for (const c of connections) {
        const g = guilds.get(c.guildId)
        if (!g || (c.scope !== "server" && c.scope !== "personal")) {
          return fail(400, "VALIDATION_ERROR", "Invalid connection.")
        }
        // サーバーでの共有には管理権限が必要
        if (c.scope === "server" && !g.canManage) {
          return fail(400, "VALIDATION_ERROR", "Sharing with a server requires the Manage Guild permission.")
        }
        next[c.guildId] = c.scope
      }
      w.connections = next
      return ok(null)
    },
  ],

  /* Voices */
  [
    "GET",
    "/api/voices",
    () => {
      // オンラインの Worker が対応している Engine の音声のみ返す
      const engines = new Set(
        getStore()
          .workers.filter(isUp)
          .flatMap((w) => w.engines.filter((e) => e.status === "healthy").map((e) => e.engine))
      )
      return ok(voices.filter((v) => engines.has(v.engine)))
    },
  ],
  [
    "POST",
    "/api/voices/preview",
    ({ body }) => {
      const input = body as VoicePreviewRequest
      if (!input?.text?.trim()) return fail(400, "VALIDATION_ERROR", "text is required.")
      return ok({ audioUrl: createPreviewWav(input.text, input.pitch ?? 0) })
    },
  ],

  /* Usage */
  [
    "GET",
    "/api/usage",
    ({ query }) => {
      const period = (query.get("period") ?? "7d") as UsagePeriod
      if (!["today", "7d", "30d", "month"].includes(period)) {
        return fail(400, "VALIDATION_ERROR", "Invalid period.")
      }
      return ok(usage(period))
    },
  ],
]

function match(pattern: string, path: string): Params | null {
  const p = pattern.split("/")
  const s = path.split("/")
  if (p.length !== s.length) return null
  const params: Params = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export function handleMockRequest(method: string, url: string, body?: unknown): MockResponse {
  const { pathname, searchParams } = new URL(url, "http://mock.local")
  const path = pathname.replace(/\/$/, "")
  if (path.startsWith(`/api/guilds/${FORBIDDEN_GUILD_ID}`)) return forbidden()
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue
    const params = match(pattern, path)
    if (params) return handler({ params, query: searchParams, body })
  }
  return notFound()
}
