import {
  ChartLineUpIcon,
  CpuIcon,
  DiscordLogoIcon,
  PlugsConnectedIcon,
} from "@phosphor-icons/react/ssr"

import { StatusBadge, type StatusTone } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { Formatters } from "@/lib/format"
import type { Guild } from "@/types/guild"
import type { BotStatus, ServiceStatus } from "@/types/status"
import type { UsageSummary } from "@/types/usage"
import type { Worker } from "@/types/worker"

import { isWorkerUp, privateWorkers, summarizeOfficial } from "@/features/workers/utils"

const botTone: Record<BotStatus, StatusTone> = { online: "success", degraded: "warning", offline: "destructive" }

function StatCard({
  title,
  icon,
  href,
  children,
}: {
  title: string
  icon: React.ReactNode
  href?: string
  children: React.ReactNode
}) {
  const card = (
    <Card size="sm" className="h-full transition-colors group-hover/stat:bg-muted/40">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardAction className="text-muted-foreground [&_svg]:size-4">{icon}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">{children}</CardContent>
    </Card>
  )
  if (!href) return card
  return (
    <GuardedLink href={href} className="group/stat outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {card}
    </GuardedLink>
  )
}

/** 上部カード 4 枚: Bot Status / Servers / Workers / Usage（仕様書 §6） */
export function StatCards({
  status,
  guilds,
  workers,
  usage,
  t,
  f,
}: {
  status: ServiceStatus
  guilds: Guild[]
  workers: Worker[]
  usage: UsageSummary
  t: Dictionary
  f: Formatters
}) {
  const installed = guilds.filter((g) => g.botInstalled)
  const active = installed.filter((g) => g.readingStatus === "active").length
  const mine = privateWorkers(workers)
  const mineUp = mine.filter(isWorkerUp).length
  const official = summarizeOfficial(workers)

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard title={t.dashboard.botStatus} icon={<PlugsConnectedIcon />}>
        <StatusBadge tone={botTone[status.bot]} className="font-heading text-xl font-semibold [&_svg]:size-4">
          {t.status[status.bot]}
        </StatusBadge>
        <span className="text-muted-foreground">
          {t.dashboard.gatewayLatency} <span className="font-medium text-foreground tabular-nums">{status.gatewayLatencyMs}ms</span>
        </span>
      </StatCard>

      <StatCard title={t.dashboard.servers} icon={<DiscordLogoIcon />} href="/servers">
        <span className="font-heading text-2xl font-semibold tabular-nums">{f.number(installed.length)}</span>
        <span className="text-muted-foreground">
          {t.dashboard.activeServers} <span className="font-medium text-foreground tabular-nums">{active}</span>
        </span>
      </StatCard>

      <StatCard title={t.dashboard.workers} icon={<CpuIcon />} href="/workers">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <StatusBadge tone="success" iconOnlyColor className="font-heading text-base font-semibold">
            {mineUp} {t.status.online}
          </StatusBadge>
          <StatusBadge tone={mine.length - mineUp > 0 ? "destructive" : "muted"} iconOnlyColor className="font-heading text-base font-semibold">
            {mine.length - mineUp} {t.status.offline}
          </StatusBadge>
        </div>
        <span className="text-muted-foreground">
          {t.dashboard.workersPrivate} ・ {official.allUp ? t.dashboard.officialOk : t.dashboard.officialDegraded}
        </span>
      </StatCard>

      <StatCard title={t.dashboard.usage} icon={<ChartLineUpIcon />} href="/usage">
        <span className="font-heading text-2xl font-semibold tabular-nums">{f.number(usage.characters)}</span>
        <span className="text-muted-foreground">{t.dashboard.thisMonth}</span>
      </StatCard>
    </div>
  )
}
