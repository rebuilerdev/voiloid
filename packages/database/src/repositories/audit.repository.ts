import type { DbClient } from "../client"
import type { Prisma } from "../generated/prisma/client"

export interface AuditEntry {
  actorUserId: string | null
  guildId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  /** 秘匿情報（トークン・画像データなど）は入れない */
  metadata?: Prisma.InputJsonValue
  ipHash?: string | null
}

export function auditRepository(db: DbClient) {
  return {
    async record(entry: AuditEntry): Promise<void> {
      await db.auditLog.create({ data: entry })
    },

    listForGuild(guildId: string, take = 50) {
      return db.auditLog.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take })
    },
  }
}

export type AuditRepository = ReturnType<typeof auditRepository>
