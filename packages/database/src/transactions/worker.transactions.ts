/**
 * Worker の重要な更新。複数テーブルにまたがるため必ず Transaction で行う。
 */
import { ENGINES, type EngineId } from "@voiloid/shared"

import type { Database } from "../client"
import { WorkerGuildScope, WorkerMode, WorkerStatus, type WorkerType } from "../generated/prisma/client"
import { auditRepository } from "../repositories/audit.repository"
import { workerSelect, type WorkerRecord } from "../repositories/worker.repository"

export interface RegisterWorkerInput {
  publicId: string
  name: string
  engines: EngineId[]
  /** secret のハッシュ（平文は保存しない） */
  secretHash: string
  type: WorkerType
  /** 自鯖Worker の所有者（公式Worker は null） */
  ownerUserId: string | null
}

/** Worker 作成 + Credential 作成 + Engine 登録 + Audit Log */
export function registerWorker(db: Database, input: RegisterWorkerInput): Promise<WorkerRecord> {
  return db.$transaction(async (tx) => {
    const worker = await tx.worker.create({
      data: {
        publicId: input.publicId,
        name: input.name,
        type: input.type,
        ownerUserId: input.ownerUserId,
        credential: { create: { secretHash: input.secretHash } },
        engines: {
          create: input.engines.map((engineId) => ({
            engineId,
            engineType: ENGINES[engineId].type,
            engineName: engineId,
          })),
        },
      },
      select: workerSelect,
    })
    await auditRepository(tx).record({
      actorUserId: input.ownerUserId,
      action: "worker.create",
      targetType: "worker",
      targetId: worker.publicId,
      metadata: { name: input.name, engines: input.engines, type: input.type },
    })
    return worker
  })
}

/**
 * Worker 削除: 無効化 → Credential 失効 → 接続先（ACL）削除 → Soft Delete。
 * この Worker を指定していたサーバーは「自動」に戻す。
 */
export function deleteWorker(db: Database, workerId: string, actorUserId: string | null): Promise<void> {
  return db.$transaction(async (tx) => {
    const now = new Date()
    const worker = await tx.worker.update({
      where: { id: workerId },
      data: { enabled: false, status: WorkerStatus.DISABLED, deletedAt: now },
      select: { publicId: true },
    })
    await tx.workerCredential.updateMany({ where: { workerId }, data: { revokedAt: now } })
    await tx.workerGuildPermission.deleteMany({ where: { workerId } })
    await tx.guildSettings.updateMany({
      where: { specificWorkerId: workerId },
      data: { workerMode: WorkerMode.AUTOMATIC, specificWorkerId: null },
    })
    await auditRepository(tx).record({
      actorUserId,
      action: "worker.delete",
      targetType: "worker",
      targetId: worker.publicId,
    })
  })
}

/** トークン再発行: secret を差し替え、失効状態を解除する */
export function rotateWorkerCredential(
  db: Database,
  workerId: string,
  secretHash: string,
  actorUserId: string | null,
): Promise<void> {
  return db.$transaction(async (tx) => {
    const now = new Date()
    await tx.workerCredential.upsert({
      where: { workerId },
      create: { workerId, secretHash },
      update: { secretHash, rotatedAt: now, revokedAt: null },
    })
    const worker = await tx.worker.findUniqueOrThrow({ where: { id: workerId }, select: { publicId: true } })
    await auditRepository(tx).record({
      actorUserId,
      action: "worker.rotate_token",
      targetType: "worker",
      targetId: worker.publicId,
    })
  })
}

export interface WorkerConnectionInput {
  /** Guild の内部 ID */
  guildId: string
  scope: WorkerGuildScope
}

/**
 * 接続先サーバーを置き換える。
 * 「サーバーで共有」でなくなったサーバーが、この Worker を指定していれば「自動」に戻す。
 */
export function replaceWorkerConnections(
  db: Database,
  workerId: string,
  connections: WorkerConnectionInput[],
  actorUserId: string,
): Promise<void> {
  return db.$transaction(async (tx) => {
    const keep = connections.map((c) => c.guildId)
    await tx.workerGuildPermission.deleteMany({ where: { workerId, guildId: { notIn: keep } } })
    for (const c of connections) {
      await tx.workerGuildPermission.upsert({
        where: { workerId_guildId: { workerId, guildId: c.guildId } },
        create: { workerId, guildId: c.guildId, scope: c.scope, grantedByUserId: actorUserId },
        update: { scope: c.scope, grantedByUserId: actorUserId },
      })
    }
    const sharedGuildIds = connections.filter((c) => c.scope === WorkerGuildScope.SERVER).map((c) => c.guildId)
    await tx.guildSettings.updateMany({
      where: { specificWorkerId: workerId, guildId: { notIn: sharedGuildIds } },
      data: { workerMode: WorkerMode.AUTOMATIC, specificWorkerId: null },
    })
    const worker = await tx.worker.findUniqueOrThrow({ where: { id: workerId }, select: { publicId: true } })
    await auditRepository(tx).record({
      actorUserId,
      action: "worker.update_connections",
      targetType: "worker",
      targetId: worker.publicId,
      metadata: { connections: connections.map((c) => ({ guildId: c.guildId, scope: c.scope })) },
    })
  })
}
