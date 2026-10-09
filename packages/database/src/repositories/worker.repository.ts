import type { DbClient } from "../client"
import { EngineHealth, type Prisma, WorkerStatus, WorkerType } from "../generated/prisma/client"

/**
 * 通常の取得で返す列。WorkerCredential（secretHash）は含めない。
 * Credential が必要なのは Gateway の認証（findForAuth）だけ。
 */
export const workerSelect = {
  id: true,
  publicId: true,
  ownerUserId: true,
  name: true,
  type: true,
  status: true,
  maxConcurrency: true,
  enabled: true,
  restrictedToGuilds: true,
  version: true,
  lastSeenAt: true,
  createdAt: true,
  engines: {
    select: {
      engineId: true,
      engineType: true,
      engineName: true,
      engineVersion: true,
      health: true,
      enabled: true,
      lastSeenAt: true,
    },
    orderBy: { engineId: "asc" },
  },
} satisfies Prisma.WorkerSelect

export type WorkerRecord = Prisma.WorkerGetPayload<{ select: typeof workerSelect }>

const active = { deletedAt: null } satisfies Prisma.WorkerWhereInput

export interface EngineSync {
  engineId: string
  engineType: string
  engineName: string
  engineVersion: string | null
  health: EngineHealth
}

export function workerRepository(db: DbClient) {
  return {
    /** 一覧: 公式Worker + 自分の自鯖Worker（削除済みを除く） */
    listVisibleTo(userId: string): Promise<WorkerRecord[]> {
      return db.worker.findMany({
        where: { ...active, OR: [{ type: WorkerType.OFFICIAL }, { ownerUserId: userId }] },
        select: workerSelect,
        orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
      })
    },

    /** 自分の自鯖Worker（公式Worker・他人の Worker・削除済みは null） */
    findOwned(publicId: string, userId: string): Promise<WorkerRecord | null> {
      return db.worker.findFirst({
        where: { ...active, publicId, type: WorkerType.PRIVATE, ownerUserId: userId },
        select: workerSelect,
      })
    },

    findByPublicId(publicId: string): Promise<WorkerRecord | null> {
      return db.worker.findFirst({ where: { ...active, publicId }, select: workerSelect })
    },

    /** Gateway の認証用。Credential を含む唯一の取得処理 */
    findForAuth(publicId: string) {
      return db.worker.findUnique({
        where: { publicId },
        select: {
          id: true,
          publicId: true,
          name: true,
          type: true,
          ownerUserId: true,
          enabled: true,
          deletedAt: true,
          credential: { select: { secretHash: true, revokedAt: true } },
          // 運営者が止めたエンジン（振り分け・声の一覧に使わない）
          engines: { where: { enabled: false }, select: { engineId: true } },
        },
      })
    },

    /** メンテナンス: 無効にすると振り分けから外れ、Gateway は接続を受け付けない */
    setEnabled(id: string, enabled: boolean): Promise<WorkerRecord> {
      return db.worker.update({
        where: { id },
        data: { enabled, status: enabled ? WorkerStatus.OFFLINE : WorkerStatus.DISABLED },
        select: workerSelect,
      })
    },

    /** 運営者によるエンジンの停止（disabled に含めたものを止め、それ以外を動かす） */
    async setDisabledEngines(id: string, disabled: string[]): Promise<void> {
      await db.workerEngine.updateMany({
        where: { workerId: id, engineId: { in: disabled } },
        data: { enabled: false },
      })
      await db.workerEngine.updateMany({
        where: { workerId: id, engineId: { notIn: disabled } },
        data: { enabled: true },
      })
    },

    /** 公式Worker の担当: true = 接続先に指定したサーバーだけ */
    setRestrictedToGuilds(id: string, restricted: boolean): Promise<WorkerRecord> {
      return db.worker.update({ where: { id }, data: { restrictedToGuilds: restricted }, select: workerSelect })
    },

    rename(id: string, name: string): Promise<WorkerRecord> {
      return db.worker.update({ where: { id }, data: { name }, select: workerSelect })
    },

    async updateStatus(
      id: string,
      status: WorkerStatus,
      extra: { lastSeenAt?: Date; version?: string; maxConcurrency?: number } = {},
    ): Promise<void> {
      // 削除・無効化された Worker の状態は上書きしない
      await db.worker.updateMany({ where: { id, ...active, enabled: true }, data: { status, ...extra } })
    },

    /** Gateway の再起動時: 接続中のままになっている Worker を OFFLINE に戻す */
    async resetOnlineStatuses(): Promise<number> {
      const result = await db.worker.updateMany({
        where: { status: { in: [WorkerStatus.ONLINE, WorkerStatus.BUSY, WorkerStatus.DEGRADED] } },
        data: { status: WorkerStatus.OFFLINE },
      })
      return result.count
    },

    /** Worker が申告したエンジンを反映する。申告に無いエンジンは UNHEALTHY にする */
    async syncEngines(workerId: string, engines: EngineSync[], seenAt: Date): Promise<void> {
      for (const engine of engines) {
        await db.workerEngine.upsert({
          where: { workerId_engineId: { workerId, engineId: engine.engineId } },
          create: { workerId, ...engine, lastSeenAt: seenAt },
          update: { ...engine, lastSeenAt: seenAt },
        })
      }
      await db.workerEngine.updateMany({
        where: { workerId, engineId: { notIn: engines.map((e) => e.engineId) } },
        data: { health: EngineHealth.UNHEALTHY },
      })
    },

    /**
     * 振り分けの候補: 公式Worker と、指定サーバーのいずれかに接続された自鯖Worker。
     * guildPermissions は指定サーバー分だけを含む（1 クエリで取得し、N+1 にしない）
     */
    listRoutingCandidates(guildIds: string[], options: { onlyConnected?: boolean } = {}) {
      return db.worker.findMany({
        where: {
          ...active,
          enabled: true,
          ...(options.onlyConnected
            ? { status: { in: [WorkerStatus.ONLINE, WorkerStatus.BUSY, WorkerStatus.DEGRADED] } }
            : {}),
          OR: [{ type: WorkerType.OFFICIAL }, { guildPermissions: { some: { guildId: { in: guildIds } } } }],
        },
        select: {
          id: true,
          publicId: true,
          name: true,
          type: true,
          ownerUserId: true,
          restrictedToGuilds: true,
          engines: { where: { health: { not: EngineHealth.UNHEALTHY }, enabled: true }, select: { engineId: true } },
          guildPermissions: { where: { guildId: { in: guildIds } }, select: { guildId: true, scope: true } },
        },
      })
    },

    /** Worker の接続先サーバー */
    listConnections(workerId: string) {
      return db.workerGuildPermission.findMany({
        where: { workerId },
        select: { scope: true, guild: { select: { id: true, discordGuildId: true, name: true } } },
      })
    },

    /** サーバーに「サーバーで共有」された自鯖Worker（Server → Worker の選択肢） */
    listSharedWithGuild(guildId: string): Promise<WorkerRecord[]> {
      return db.worker.findMany({
        where: { ...active, type: WorkerType.PRIVATE, guildPermissions: { some: { guildId, scope: "SERVER" } } },
        select: workerSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      })
    },
  }
}

export type WorkerRepository = ReturnType<typeof workerRepository>
