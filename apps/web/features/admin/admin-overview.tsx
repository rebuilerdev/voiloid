"use client"

import {
  ArrowRightIcon,
  ChartLineUpIcon,
  DiscordLogoIcon,
  PlugsConnectedIcon,
  StackIcon,
  UsersThreeIcon,
  CpuIcon,
} from "@phosphor-icons/react"

import { StatusBadge, type StatusTone } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import type { AdminOverview as Overview, UsageTotals } from "@/types/admin"
import type { BotStatus } from "@/types/status"

import { AuditLogTable } from "@/features/admin/audit-log-table"

const botTone: Record<BotStatus, StatusTone> = { online: "success", degraded: "warning", offline: "destructive" }

function Stat({
  title,
  icon,
  href,
  value,
  sub,
}: {
  title: string
  icon: React.ReactNode
  href?: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  const card = (
    <Card size="sm" className="h-full transition-colors group-hover/stat:bg-muted/40">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardAction className="text-muted-foreground [&_svg]:size-4">{icon}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="font-heading text-xl font-semibold tabular-nums">{value}</span>
        {sub && <span className="text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  )
  return href ? (
    <GuardedLink href={href} className="group/stat outline-none focus-visible:ring-1 focus-visible:ring-ring">
      {card}
    </GuardedLink>
  ) : (
    card
  )
}

function UsageCard({ title, usage }: { title: string; usage: UsageTotals }) {
  const { t, f } = useI18n()
  return (
    <Stat
      title={title}
      icon={<ChartLineUpIcon />}
      value={fmt(t.common.characters, { count: f.number(usage.characters) })}
      sub={
        <>
          {fmt(t.admin.requests, { count: f.number(usage.requests) })} ·{" "}
          {fmt(t.admin.usageBreakdown, {
            official: f.number(usage.officialCharacters),
            private: f.number(usage.privateCharacters),
          })}
        </>
      }
    />
  )
}

/** 運営コンソールの概要: サービス全体の状態 */
export function AdminOverview({ overview }: { overview: Overview }) {
  const { t } = useI18n()
  const { bot, workers, guilds, users, usage } = overview
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          title={t.admin.bot}
          icon={<PlugsConnectedIcon />}
          value={
            <StatusBadge tone={botTone[bot.status]} className="font-heading text-xl font-semibold [&_svg]:size-4">
              {t.status[bot.status]}
            </StatusBadge>
          }
          sub={fmt(t.admin.ping, { ms: bot.pingMs })}
        />
        <Stat
          title={t.admin.officialWorkers}
          icon={<StackIcon />}
          href="/admin/workers"
          value={fmt(t.admin.connected, { online: workers.official.online, total: workers.official.total })}
        />
        <Stat
          title={t.admin.privateWorkers}
          icon={<CpuIcon />}
          value={fmt(t.admin.connected, { online: workers.private.online, total: workers.private.total })}
        />
        <Stat
          title={t.admin.guilds}
          icon={<DiscordLogoIcon />}
          href="/admin/guilds"
          value={guilds.installed}
          sub={fmt(t.admin.guildsTotal, { total: guilds.total })}
        />
        <Stat title={t.admin.users} icon={<UsersThreeIcon />} href="/admin/users" value={users} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <UsageCard title={t.admin.usageToday} usage={usage.today} />
        <UsageCard title={t.admin.usage7d} usage={usage.last7Days} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.recentAudit}</CardTitle>
          <CardAction>
            <GuardedLink href="/admin/audit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t.admin.viewAllAudit}
              <ArrowRightIcon data-icon="inline-end" />
            </GuardedLink>
          </CardAction>
        </CardHeader>
        <CardContent>
          {overview.recentAuditLogs.length === 0 ? (
            <p className="text-muted-foreground">{t.admin.noResults}</p>
          ) : (
            <AuditLogTable entries={overview.recentAuditLogs} />
          )}
        </CardContent>
      </Card>
    </>
  )
}
