/**
 * 利用量（管理しているサーバーの合計）。上限は無い。
 */
import type { UsagePeriod, UsageSummary } from "@voiloid/shared/contracts"

import type { AppDeps } from "../deps"
import type { Session } from "../lib/session"
import { addDays, dateRange, localDate, startOfDay, startOfLocalDate, startOfMonth } from "../lib/time"
import type { AccessService } from "./access.service"

export function createUsageService(deps: AppDeps, access: AccessService) {
  function since(period: UsagePeriod): Date {
    const tz = deps.config.USAGE_TIME_ZONE
    const now = deps.now()
    switch (period) {
      case "today":
        return startOfDay(now, tz)
      case "7d":
        return startOfLocalDate(addDays(localDate(now, tz), -6), tz)
      case "30d":
        return startOfLocalDate(addDays(localDate(now, tz), -29), tz)
      case "month":
        return startOfMonth(now, tz)
    }
  }

  return {
    async summary(session: Session, period: UsagePeriod): Promise<UsageSummary> {
      const guilds = (await access.manageableGuilds(session)).flatMap((g) =>
        g.guild?.botInstalled ? [{ id: g.guild.id, name: g.discord.name, discordId: g.discord.id }] : [],
      )
      const from = since(period)
      const result = await deps.repos.usage.summarize({
        guildIds: guilds.map((g) => g.id),
        since: from,
        timeZone: deps.config.USAGE_TIME_ZONE,
      })

      const sum = (rows: { characters: number; requests: number }[]) =>
        rows.reduce((acc, r) => ({ characters: acc.characters + r.characters, requests: acc.requests + r.requests }), {
          characters: 0,
          requests: 0,
        })
      const total = sum(result.byWorkerType)
      const official = sum(result.byWorkerType.filter((r) => r.workerType === "OFFICIAL"))
      const privateUsage = sum(result.byWorkerType.filter((r) => r.workerType === "PRIVATE"))

      // 利用の無い日も 0 として返す（グラフの横軸を揃える）
      const byDate = new Map(result.daily.map((d) => [d.date, d]))
      const tz = deps.config.USAGE_TIME_ZONE
      const daily = dateRange(localDate(from, tz), localDate(deps.now(), tz)).map((date) => ({
        date,
        characters: byDate.get(date)?.characters ?? 0,
        requests: byDate.get(date)?.requests ?? 0,
      }))

      const usageByGuild = new Map(result.byGuild.map((g) => [g.guildId, g]))
      const byGuild = guilds
        .map((g) => ({
          guildId: g.discordId,
          guildName: g.name,
          characters: usageByGuild.get(g.id)?.characters ?? 0,
          requests: usageByGuild.get(g.id)?.requests ?? 0,
        }))
        .filter((g) => g.requests > 0)
        .sort((a, b) => b.characters - a.characters)

      return {
        period,
        characters: total.characters,
        requests: total.requests,
        officialWorkerCharacters: official.characters,
        privateWorkerCharacters: privateUsage.characters,
        daily,
        byGuild,
      }
    },
  }
}

export type UsageService = ReturnType<typeof createUsageService>
