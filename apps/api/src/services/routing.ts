/**
 * 「使えるエンジン」の算出（設定ベース。接続状態は問わない）。
 * 振り分けの判定は Gateway と同じ純粋関数（@voiloid/shared）を使う。
 */
import { routingSettings, routingWorker, type GuildSettings } from "@voiloid/database"
import { availableEngines, serverWorkerTiers, workerTiersFor } from "@voiloid/shared"

import type { AppDeps } from "../deps"

/**
 * サーバーごとに使えるエンジン（サーバーでオフにしたエンジンは除く）。
 * userId を指定すると、そのユーザーが自分専用で接続した Worker も含める。
 */
export async function enginesByGuild(
  deps: AppDeps,
  guilds: { id: string; settings: GuildSettings }[],
  userId: string | null,
): Promise<Map<string, string[]>> {
  if (guilds.length === 0) return new Map()
  // 全サーバー分の候補を 1 クエリで取得する（N+1 にしない）
  const candidates = await deps.repos.workers.listRoutingCandidates(guilds.map((g) => g.id))
  return new Map(
    guilds.map(({ id, settings }) => {
      const workers = candidates
        .filter((w) => w.type === "OFFICIAL" || w.guildPermissions.some((p) => p.guildId === id))
        .map((w) => routingWorker({ ...w, guildPermissions: w.guildPermissions.filter((p) => p.guildId === id) }))
      const routing = routingSettings(settings)
      const tiers = userId === null ? serverWorkerTiers(routing, workers) : workerTiersFor(routing, workers, userId)
      return [id, availableEngines(tiers, routing.disabledEngines)] as const
    }),
  )
}
