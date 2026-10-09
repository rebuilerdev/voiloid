import type { DbClient } from "../client"
import type { OperatorRole } from "../generated/prisma/client"

export function operatorRepository(db: DbClient) {
  return {
    list() {
      return db.operator.findMany({ orderBy: [{ role: "asc" }, { createdAt: "asc" }] })
    },

    find(discordUserId: string) {
      return db.operator.findUnique({ where: { discordUserId } })
    },

    upsert(discordUserId: string, role: OperatorRole, createdByUserId: string | null) {
      return db.operator.upsert({
        where: { discordUserId },
        create: { discordUserId, role, createdByUserId },
        update: { role },
      })
    },

    /** 削除できたら true */
    async delete(discordUserId: string): Promise<boolean> {
      const result = await db.operator.deleteMany({ where: { discordUserId } })
      return result.count > 0
    },
  }
}

export type OperatorRepository = ReturnType<typeof operatorRepository>
