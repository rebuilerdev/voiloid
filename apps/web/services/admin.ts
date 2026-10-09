import type {
  AdminGuild,
  AdminGuildDetail,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminWorker,
  AdminWorkerConnection,
  AdminWorkerFilter,
  AuditLogEntry,
  AuditLogFilter,
  BotCommandResult,
  OperatorEntry,
  OperatorLevel,
  Page,
  SystemSettingsView,
  UpdateAdminWorkerRequest,
  UpdateSystemSettingsRequest,
} from "@/types/admin"
import type { VoiceSettings } from "@/types/voice"
import type { CreateWorkerRequest, CreateWorkerResponse, UpdateWorkerGuildsRequest } from "@/types/worker"
import { apiRequest } from "@/services/http"

/** 運営コンソールの API（運営者のみ。それ以外は 404） */
const base = "/api/admin"

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])))
  return search.size > 0 ? `?${search}` : ""
}

export function getAdminOverview() {
  return apiRequest<AdminOverview>("GET", `${base}/overview`)
}

export function listOfficialWorkers() {
  return apiRequest<AdminWorker[]>("GET", `${base}/workers`)
}

export function createOfficialWorker(input: CreateWorkerRequest) {
  return apiRequest<CreateWorkerResponse>("POST", `${base}/workers`, input)
}

/** 公式Worker・自鯖Worker のトークンを再発行する */
export function regenerateAdminWorkerToken(workerId: string) {
  return apiRequest<{ token: string }>("POST", `${base}/workers/${encodeURIComponent(workerId)}/regenerate-token`)
}

/** 公式Worker・自鯖Worker を削除する */
export function deleteAdminWorker(workerId: string) {
  return apiRequest<null>("DELETE", `${base}/workers/${encodeURIComponent(workerId)}`)
}

export function listAdminGuilds(params: { query?: string; cursor?: string } = {}) {
  return apiRequest<Page<AdminGuild>>("GET", `${base}/guilds${query(params)}`)
}

export function getAdminGuild(guildId: string) {
  return apiRequest<AdminGuildDetail>("GET", `${base}/guilds/${encodeURIComponent(guildId)}`)
}

export function listAdminUsers(params: { query?: string; cursor?: string } = {}) {
  return apiRequest<Page<AdminUser>>("GET", `${base}/users${query(params)}`)
}

export function listAuditLogs(params: AuditLogFilter & { cursor?: string } = {}) {
  return apiRequest<Page<AuditLogEntry>>("GET", `${base}/audit-logs${query(params)}`)
}

/* ---------- Worker（公式・自鯖） ---------- */

const worker = (workerId: string) => `${base}/workers/${encodeURIComponent(workerId)}`

export function listPrivateWorkers(params: { query?: string; cursor?: string; status?: AdminWorkerFilter } = {}) {
  return apiRequest<Page<AdminWorker>>("GET", `${base}/private-workers${query(params)}`)
}

export function getAdminWorker(workerId: string) {
  return apiRequest<AdminWorker>("GET", worker(workerId))
}

export function updateAdminWorker(workerId: string, input: UpdateAdminWorkerRequest) {
  return apiRequest<AdminWorker>("PATCH", worker(workerId), input)
}

export function disconnectAdminWorker(workerId: string) {
  return apiRequest<null>("POST", `${worker(workerId)}/disconnect`)
}

export function getAdminWorkerConnections(workerId: string) {
  return apiRequest<AdminWorkerConnection[]>("GET", `${worker(workerId)}/connections`)
}

export function updateAdminWorkerConnections(workerId: string, input: UpdateWorkerGuildsRequest) {
  return apiRequest<null>("PUT", `${worker(workerId)}/connections`, input)
}

/* ---------- サーバー ---------- */

const guild = (guildId: string) => `${base}/guilds/${encodeURIComponent(guildId)}`

export function suspendGuild(guildId: string, reason: string) {
  return apiRequest<null>("POST", `${guild(guildId)}/suspend`, { reason })
}

export function unsuspendGuild(guildId: string) {
  return apiRequest<null>("POST", `${guild(guildId)}/unsuspend`)
}

export function stopGuildSessions(guildId: string) {
  return apiRequest<BotCommandResult>("POST", `${guild(guildId)}/stop-sessions`)
}

export function leaveGuild(guildId: string, reason: string) {
  return apiRequest<BotCommandResult>("POST", `${guild(guildId)}/leave`, { reason })
}

export function removeGuildWorker(guildId: string, workerId: string) {
  return apiRequest<null>("DELETE", `${guild(guildId)}/workers/${encodeURIComponent(workerId)}`)
}

/* ---------- ユーザー ---------- */

const user = (userId: string) => `${base}/users/${encodeURIComponent(userId)}`

export function getAdminUser(userId: string) {
  return apiRequest<AdminUserDetail>("GET", user(userId))
}

export function setAdminUserVoice(userId: string, voice: VoiceSettings | null) {
  return apiRequest<null>("PUT", `${user(userId)}/voice`, { voice })
}

export function logoutAdminUser(userId: string) {
  return apiRequest<{ sessions: number }>("POST", `${user(userId)}/logout`)
}

export function suspendUser(userId: string, reason: string) {
  return apiRequest<null>("POST", `${user(userId)}/suspend`, { reason })
}

export function unsuspendUser(userId: string) {
  return apiRequest<null>("POST", `${user(userId)}/unsuspend`)
}

export function deleteAdminUser(userId: string, reason: string) {
  return apiRequest<{ deletedWorkers: number }>("POST", `${user(userId)}/delete`, { reason })
}

/* ---------- サービス全体の設定 ---------- */

export function getSystemSettings() {
  return apiRequest<SystemSettingsView>("GET", `${base}/system`)
}

export function updateSystemSettings(input: UpdateSystemSettingsRequest) {
  return apiRequest<SystemSettingsView>("PATCH", `${base}/system`, input)
}

export function registerCommands() {
  return apiRequest<BotCommandResult>("POST", `${base}/system/register-commands`)
}

/* ---------- 運営者 ---------- */

export function listOperators() {
  return apiRequest<OperatorEntry[]>("GET", `${base}/operators`)
}

export function addOperator(discordUserId: string, role: OperatorLevel) {
  return apiRequest<null>("POST", `${base}/operators`, { discordUserId, role })
}

export function updateOperator(discordUserId: string, role: OperatorLevel) {
  return apiRequest<null>("PATCH", `${base}/operators/${encodeURIComponent(discordUserId)}`, { role })
}

export function removeOperator(discordUserId: string) {
  return apiRequest<null>("DELETE", `${base}/operators/${encodeURIComponent(discordUserId)}`)
}
