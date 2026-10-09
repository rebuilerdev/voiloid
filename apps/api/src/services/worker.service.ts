/**
 * Worker の一覧・登録・名前変更・削除・トークン再発行・接続先サーバー。
 * 公式Worker は一覧（状態）のみ。詳細・操作は自分の自鯖Worker に限る。
 */
import {
  deleteWorker,
  generatePublicId,
  generateWorkerCredential,
  registerWorker,
  replaceWorkerConnections,
  rotateWorkerCredential,
  scopeFromDb,
  scopeToDb,
  WorkerStatus,
  WorkerType,
  workerStatusFromDb,
  workerTypeFromDb,
  type WorkerRecord,
} from "@voiloid/database"
import { AppError, forbidden, notFound } from "@voiloid/shared"
import type {
  CreateWorkerRequest,
  CreateWorkerResponse,
  UpdateWorkerGuildsRequest,
  UpdateWorkerRequest,
  Worker,
  WorkerGuildConnection,
} from "@voiloid/shared/contracts"
import type { WorkerLive } from "@voiloid/shared/protocol"

import type { AppDeps } from "../deps"
import type { Session } from "../lib/session"
import type { AccessService } from "./access.service"
import type { LiveService } from "./live.service"

const CONNECTED = new Set<WorkerStatus>([WorkerStatus.ONLINE, WorkerStatus.BUSY, WorkerStatus.DEGRADED])

export function toApiWorker(worker: WorkerRecord, live: WorkerLive | undefined): Worker {
  let status: Worker["status"]
  if (live) {
    status = live.status === "busy" ? "busy" : live.status === "degraded" ? "error" : "online"
  } else {
    // DB 上は接続中でも、リアルタイム状態が切れていれば切断とみなす（Gateway の異常終了など）
    status = CONNECTED.has(worker.status) ? "offline" : workerStatusFromDb[worker.status]
  }
  return {
    id: worker.publicId,
    name: worker.name,
    type: workerTypeFromDb(worker.type),
    status,
    engines: worker.engines.map((e) => ({
      engine: e.engineId,
      status: e.health === "HEALTHY" || e.health === "DEGRADED" ? "healthy" : "unhealthy",
      version: e.engineVersion ?? undefined,
    })),
    runningJobs: live?.runningJobs ?? 0,
    maxConcurrency:
      live?.maxConcurrency ??
      (worker.concurrencyLimit ? Math.min(worker.maxConcurrency, worker.concurrencyLimit) : worker.maxConcurrency),
    workerConcurrency: worker.maxConcurrency,
    concurrencyLimit: worker.concurrencyLimit ?? undefined,
    latency: live?.latencyMs,
    lastSeenAt: live?.lastSeenAt ?? worker.lastSeenAt?.toISOString(),
    queue: live?.queue ?? 0,
    createdAt: worker.createdAt.toISOString(),
  }
}

export function createWorkerService(deps: AppDeps, access: AccessService, live: LiveService) {
  async function owned(session: Session, publicId: string): Promise<WorkerRecord> {
    const worker = await deps.repos.workers.findOwned(publicId, session.userId)
    if (!worker) throw notFound("Worker")
    return worker
  }

  async function withLive(worker: WorkerRecord): Promise<Worker> {
    return toApiWorker(worker, (await live.workers([worker.id])).get(worker.id))
  }

  return {
    async list(session: Session): Promise<Worker[]> {
      const workers = await deps.repos.workers.listVisibleTo(session.userId)
      const states = await live.workers(workers.map((w) => w.id))
      return workers.map((w) => toApiWorker(w, states.get(w.id)))
    },

    async get(session: Session, publicId: string): Promise<Worker> {
      return withLive(await owned(session, publicId))
    },

    async create(session: Session, input: CreateWorkerRequest): Promise<CreateWorkerResponse> {
      const count = await deps.db.worker.count({
        where: { ownerUserId: session.userId, type: WorkerType.PRIVATE, deletedAt: null },
      })
      const { maxWorkersPerUser } = await deps.repos.system.get()
      if (count >= maxWorkersPerUser) {
        throw new AppError("VALIDATION_ERROR", `You can register up to ${maxWorkersPerUser} workers.`)
      }
      const publicId = generatePublicId()
      const credential = generateWorkerCredential(publicId)
      const worker = await registerWorker(deps.db, {
        publicId,
        name: input.name,
        engines: input.engines,
        secretHash: credential.secretHash,
        type: WorkerType.PRIVATE,
        ownerUserId: session.userId,
      })
      // トークンはこのレスポンスでのみ返す（保存しない）
      return { worker: toApiWorker(worker, undefined), token: credential.token }
    },

    /** 名前の変更・同時処理の上限（所有者） */
    async update(session: Session, publicId: string, input: UpdateWorkerRequest): Promise<Worker> {
      let worker = await owned(session, publicId)
      if (input.name !== undefined) {
        worker = await deps.repos.workers.rename(worker.id, input.name)
        await deps.repos.audit.record({
          actorUserId: session.userId,
          action: "worker.rename",
          targetType: "worker",
          targetId: publicId,
          metadata: { name: input.name },
        })
      }
      if (input.concurrencyLimit !== undefined && input.concurrencyLimit !== worker.concurrencyLimit) {
        worker = await deps.repos.workers.setConcurrencyLimit(worker.id, input.concurrencyLimit)
        await deps.repos.audit.record({
          actorUserId: session.userId,
          action: "worker.update_concurrency",
          targetType: "worker",
          targetId: publicId,
          metadata: { concurrencyLimit: input.concurrencyLimit ?? "none" },
        })
        // Gateway が接続中の Worker の上限を読み直す（切断しない）
        await live.invalidate({ kind: "worker", workerId: publicId })
      }
      return withLive(worker)
    },

    async delete(session: Session, publicId: string): Promise<void> {
      const worker = await owned(session, publicId)
      await deleteWorker(deps.db, worker.id, session.userId)
      // 接続中なら Gateway が切断する
      await live.invalidate({ kind: "worker", workerId: publicId })
    },

    async regenerateToken(session: Session, publicId: string): Promise<{ token: string }> {
      const worker = await owned(session, publicId)
      const credential = generateWorkerCredential(worker.publicId)
      await rotateWorkerCredential(deps.db, worker.id, credential.secretHash, session.userId)
      // 古いトークンでの接続を切断する
      await live.invalidate({ kind: "worker", workerId: publicId })
      return { token: credential.token }
    },

    /**
     * サーバーに「サーバーで共有」された自鯖Worker（Server → Worker の選択肢）。
     * 管理者には他のユーザーが共有した Worker も表示する（名前と状態のみ）
     */
    async sharedWithGuild(session: Session, discordGuildId: string): Promise<Worker[]> {
      const { guild } = await access.requireManageableInstalled(session, discordGuildId)
      const workers = await deps.repos.workers.listSharedWithGuild(guild.id)
      const states = await live.workers(workers.map((w) => w.id))
      return workers.map((w) => toApiWorker(w, states.get(w.id)))
    },

    /** 参加しているサーバー（Bot 導入済み）と、この Worker の接続状態 */
    async connections(session: Session, publicId: string): Promise<WorkerGuildConnection[]> {
      const worker = await owned(session, publicId)
      const [guilds, current] = await Promise.all([
        access.installedMemberGuilds(session),
        deps.repos.workers.listConnections(worker.id),
      ])
      const scopes = new Map(current.map((c) => [c.guild.id, scopeFromDb[c.scope]]))
      return guilds.map((g) => ({
        guildId: g.discord.id,
        guildName: g.discord.name,
        canManage: g.canManage,
        scope: scopes.get(g.guild.id) ?? "none",
      }))
    },

    /**
     * 接続先を置き換える。
     * - サーバーで共有: そのサーバーの管理権限が必要
     * - 自分専用: 参加しているサーバーならどこでも可
     */
    async updateConnections(session: Session, publicId: string, input: UpdateWorkerGuildsRequest): Promise<void> {
      const worker = await owned(session, publicId)
      const guilds = new Map((await access.installedMemberGuilds(session)).map((g) => [g.discord.id, g]))
      const connections = input.connections.map((c) => {
        const target = guilds.get(c.guildId)
        if (!target) throw notFound("Guild")
        if (c.scope === "server" && !target.canManage) {
          throw forbidden("Sharing a worker with a server requires the Manage Server permission.")
        }
        return { guildId: target.guild.id, scope: scopeToDb[c.scope] }
      })
      await replaceWorkerConnections(deps.db, worker.id, connections, session.userId)
      // Gateway は Worker の変更通知で全サーバーの振り分けを再計算する
      await live.invalidate({ kind: "worker", workerId: publicId })
    },
  }
}

export type WorkerService = ReturnType<typeof createWorkerService>
