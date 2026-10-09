/**
 * 運営コンソール用の取得（全体の集計・検索・ページング）。
 * 一覧はページ単位でまとめて取得し、行ごとにクエリを発行しない（N+1 にしない）。
 */
import type { DbClient } from "../client"
import { WorkerStatus, WorkerType, type Prisma } from "../generated/prisma/client"
import { workerSelect } from "./worker.repository"

/** UUIDv7 は時刻順のため、ID の降順 = 新しい順。カーソルは最後の行の ID */
export interface PageInput {
  query?: string
  cursor?: string
  take: number
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
}

function paginate<T extends { id: string }>(rows: T[], take: number): PageResult<T> {
  const items = rows.slice(0, take)
  return { items, nextCursor: rows.length > take ? (items.at(-1)?.id ?? null) : null }
}

const cursorWhere = (cursor: string | undefined) => (cursor ? { id: { lt: cursor } } : {})

const CONNECTED: WorkerStatus[] = [WorkerStatus.ONLINE, WorkerStatus.BUSY, WorkerStatus.DEGRADED]

export function adminRepository(db: DbClient) {
  return {
    async counts() {
      const [installedGuilds, totalGuilds, users, workers] = await Promise.all([
        db.guild.count({ where: { botInstalled: true } }),
        db.guild.count(),
        db.user.count(),
        db.worker.groupBy({ by: ["type", "status"], where: { deletedAt: null }, _count: { _all: true } }),
      ])
      const count = (type: WorkerType, connected?: boolean) =>
        workers
          .filter((w) => w.type === type && (connected === undefined || CONNECTED.includes(w.status) === connected))
          .reduce((sum, w) => sum + w._count._all, 0)
      return {
        installedGuilds,
        totalGuilds,
        users,
        officialWorkers: { total: count(WorkerType.OFFICIAL), online: count(WorkerType.OFFICIAL, true) },
        privateWorkers: { total: count(WorkerType.PRIVATE), online: count(WorkerType.PRIVATE, true) },
      }
    },

    /** 全サーバーの利用量（成功した合成のみ）を Worker の種別ごとに */
    async usageTotals(since: Date) {
      const rows = await db.usageEvent.groupBy({
        by: ["workerType"],
        where: { createdAt: { gte: since }, success: true },
        _sum: { characters: true },
        _count: { _all: true },
      })
      const total = { characters: 0, requests: 0, officialCharacters: 0, privateCharacters: 0 }
      for (const row of rows) {
        const characters = row._sum.characters ?? 0
        total.characters += characters
        total.requests += row._count._all
        if (row.workerType === WorkerType.OFFICIAL) total.officialCharacters += characters
        if (row.workerType === WorkerType.PRIVATE) total.privateCharacters += characters
      }
      return total
    },

    async guilds(input: PageInput) {
      const query = input.query?.trim()
      const where: Prisma.GuildWhereInput = {
        ...cursorWhere(input.cursor),
        ...(query
          ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { discordGuildId: { startsWith: query } }] }
          : {}),
      }
      const rows = await db.guild.findMany({ where, orderBy: { id: "desc" }, take: input.take + 1 })
      return paginate(rows, input.take)
    },

    /** サーバーごとの、指定時刻以降の読み上げ数（1 クエリ） */
    async messagesSince(guildIds: string[], since: Date): Promise<Map<string, number>> {
      if (guildIds.length === 0) return new Map()
      const rows = await db.usageEvent.groupBy({
        by: ["guildId"],
        where: { guildId: { in: guildIds }, createdAt: { gte: since }, success: true },
        _count: { _all: true },
      })
      return new Map(rows.map((r) => [r.guildId, r._count._all]))
    },

    guildDetail(discordGuildId: string) {
      return db.guild.findUnique({
        where: { discordGuildId },
        include: {
          settings: true,
          workerPermissions: {
            where: { worker: { deletedAt: null } },
            select: {
              scope: true,
              worker: {
                select: {
                  publicId: true,
                  name: true,
                  status: true,
                  owner: { select: { discordUsername: true, discordGlobalName: true } },
                },
              },
            },
          },
          _count: { select: { dictionaryEntries: true } },
        },
      })
    },

    async users(input: PageInput) {
      const query = input.query?.trim()
      const where: Prisma.UserWhereInput = {
        ...cursorWhere(input.cursor),
        ...(query
          ? {
              OR: [
                { discordUsername: { contains: query, mode: "insensitive" } },
                { discordGlobalName: { contains: query, mode: "insensitive" } },
                { discordUserId: { startsWith: query } },
              ],
            }
          : {}),
      }
      const rows = await db.user.findMany({
        where,
        orderBy: { id: "desc" },
        take: input.take + 1,
        include: {
          voiceSettings: { select: { userId: true } },
          _count: { select: { workers: { where: { deletedAt: null, type: WorkerType.PRIVATE } } } },
        },
      })
      return paginate(rows, input.take)
    },

    async auditLogs(input: { actionPrefix?: string; guildId?: string; cursor?: string; take: number }) {
      const rows = await db.auditLog.findMany({
        where: {
          ...cursorWhere(input.cursor),
          ...(input.actionPrefix ? { action: { startsWith: input.actionPrefix } } : {}),
          ...(input.guildId ? { guildId: input.guildId } : {}),
        },
        orderBy: { id: "desc" },
        take: input.take + 1,
        include: {
          actor: { select: { discordUserId: true, discordUsername: true, discordGlobalName: true } },
          guild: { select: { discordGuildId: true, name: true } },
        },
      })
      return paginate(rows, input.take)
    },

    /** 自鯖Worker（削除済みを除く）。名前・ID・所有者で検索し、新しい順にページングする */
    async privateWorkers(input: PageInput & { status?: "connected" | "disconnected" | "disabled" }) {
      const query = input.query?.trim()
      const where: Prisma.WorkerWhereInput = {
        ...cursorWhere(input.cursor),
        type: WorkerType.PRIVATE,
        deletedAt: null,
        ...(input.status === "connected" ? { status: { in: CONNECTED }, enabled: true } : {}),
        ...(input.status === "disconnected" ? { status: { notIn: CONNECTED }, enabled: true } : {}),
        ...(input.status === "disabled" ? { enabled: false } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { publicId: { startsWith: query } },
                { owner: { discordUsername: { contains: query, mode: "insensitive" } } },
                { owner: { discordUserId: { startsWith: query } } },
              ],
            }
          : {}),
      }
      const rows = await db.worker.findMany({
        where,
        orderBy: { id: "desc" },
        take: input.take + 1,
        select: {
          ...workerSelect,
          owner: { select: { discordUserId: true, discordUsername: true, discordGlobalName: true } },
          _count: { select: { guildPermissions: true } },
        },
      })
      return paginate(rows, input.take)
    },

    /** ユーザーの自鯖Worker */
    workersOwnedBy(userId: string) {
      return db.worker.findMany({
        where: { ownerUserId: userId, type: WorkerType.PRIVATE, deletedAt: null },
        select: { ...workerSelect, _count: { select: { guildPermissions: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    },

    userDetail(discordUserId: string) {
      return db.user.findUnique({
        where: { discordUserId },
        include: { voiceSettings: true },
      })
    },

    /** 公式Worker（削除済みを除く。Credential は含めない） */
    officialWorkers() {
      return db.worker.findMany({
        where: { type: WorkerType.OFFICIAL, deletedAt: null },
        select: { ...workerSelect, _count: { select: { guildPermissions: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    },

    /** Worker の詳細（公式・自鯖。削除済みを除く） */
    workerDetail(publicId: string) {
      return db.worker.findFirst({
        where: { publicId, deletedAt: null },
        select: {
          ...workerSelect,
          owner: { select: { discordUserId: true, discordUsername: true, discordGlobalName: true } },
          _count: { select: { guildPermissions: true } },
        },
      })
    },

    /** Worker の接続先（運営者による変更用。Guild の Discord ID と名前を含める） */
    workerConnections(workerId: string) {
      return db.workerGuildPermission.findMany({
        where: { workerId },
        select: { scope: true, guild: { select: { id: true, discordGuildId: true, name: true } } },
        orderBy: { createdAt: "asc" },
      })
    },
  }
}

export type AdminRepository = ReturnType<typeof adminRepository>
