import type { DbClient } from "../client"
import { Prisma, type WorkerType } from "../generated/prisma/client"

export interface UsageEventInput {
  userId: string | null
  guildId: string
  workerId: string | null
  workerType: WorkerType | null
  engineId: string
  characters: number
  audioDurationMs: number | null
  success: boolean
}

export interface UsageRange {
  guildIds: string[]
  since: Date
  /** 日別集計の区切り（IANA タイムゾーン名） */
  timeZone: string
}

export function usageRepository(db: DbClient) {
  return {
    async record(event: UsageEventInput): Promise<void> {
      await db.usageEvent.create({ data: event })
    },

    /** 成功した合成のみを集計する */
    async summarize(range: UsageRange) {
      const where = {
        guildId: { in: range.guildIds },
        createdAt: { gte: range.since },
        success: true,
      } satisfies Prisma.UsageEventWhereInput

      const [byWorkerType, byGuild, daily] = await Promise.all([
        db.usageEvent.groupBy({ by: ["workerType"], where, _sum: { characters: true }, _count: { _all: true } }),
        db.usageEvent.groupBy({ by: ["guildId"], where, _sum: { characters: true }, _count: { _all: true } }),
        range.guildIds.length === 0
          ? Promise.resolve([])
          : // 日付の区切りをタイムゾーンに合わせるため、集計は Parameterized Query で行う
            db.$queryRaw<{ date: string; characters: number; requests: number }[]>(Prisma.sql`
              SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD') AS "date",
                     COALESCE(SUM("characters"), 0)::int AS "characters",
                     COUNT(*)::int AS "requests"
              FROM "UsageEvent"
              WHERE "guildId" = ANY(${range.guildIds}::uuid[])
                AND "createdAt" >= ${range.since}
                AND "success" = true
              GROUP BY 1
              ORDER BY 1`),
      ])

      return {
        byWorkerType: byWorkerType.map((r) => ({
          workerType: r.workerType,
          characters: r._sum.characters ?? 0,
          requests: r._count._all,
        })),
        byGuild: byGuild.map((r) => ({
          guildId: r.guildId,
          characters: r._sum.characters ?? 0,
          requests: r._count._all,
        })),
        daily,
      }
    },

    countSince(guildId: string, since: Date) {
      return db.usageEvent.count({ where: { guildId, createdAt: { gte: since }, success: true } })
    },

    /** サーバーごとの最終利用日時 */
    async lastActivity(guildIds: string[]): Promise<Map<string, Date>> {
      const rows = await db.usageEvent.groupBy({
        by: ["guildId"],
        where: { guildId: { in: guildIds } },
        _max: { createdAt: true },
      })
      return new Map(rows.flatMap((r) => (r._max.createdAt ? [[r.guildId, r._max.createdAt] as const] : [])))
    },
  }
}

export type UsageRepository = ReturnType<typeof usageRepository>
