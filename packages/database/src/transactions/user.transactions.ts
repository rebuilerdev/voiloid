/**
 * ユーザーデータの削除（運営者による。本人からの削除依頼などに対応する）。
 * 1 つの Transaction で: 自鯖Worker を削除（無効化・Credential 失効・接続先の削除・Soft Delete）→ ユーザーを削除。
 * 音声設定は Cascade で削除され、辞書の作成者・監査ログの実行者は NULL になって記録は残る。
 */
import type { Database } from "../client"
import { WorkerMode, WorkerStatus } from "../generated/prisma/client"
import { auditRepository } from "../repositories/audit.repository"

export function deleteUserData(
  db: Database,
  userId: string,
  options: { actorUserId: string; reason: string },
): Promise<{ deletedWorkers: number }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { discordUserId: true } })
    const workers = await tx.worker.findMany({ where: { ownerUserId: userId, deletedAt: null }, select: { id: true } })
    const workerIds = workers.map((w) => w.id)
    const now = new Date()
    if (workerIds.length > 0) {
      await tx.worker.updateMany({
        where: { id: { in: workerIds } },
        data: { enabled: false, status: WorkerStatus.DISABLED, deletedAt: now },
      })
      await tx.workerCredential.updateMany({ where: { workerId: { in: workerIds } }, data: { revokedAt: now } })
      await tx.workerGuildPermission.deleteMany({ where: { workerId: { in: workerIds } } })
      await tx.guildSettings.updateMany({
        where: { specificWorkerId: { in: workerIds } },
        data: { workerMode: WorkerMode.AUTOMATIC, specificWorkerId: null },
      })
    }
    await tx.user.delete({ where: { id: userId } })
    await auditRepository(tx).record({
      actorUserId: options.actorUserId,
      action: "admin.user.delete",
      targetType: "user",
      // ユーザーの内部 ID は削除されるため、Discord の ID を記録する
      targetId: user.discordUserId,
      metadata: { reason: options.reason, deletedWorkers: workerIds.length },
    })
    return { deletedWorkers: workerIds.length }
  })
}
