"use client"

import { useState } from "react"
import { CpuIcon, SealCheckIcon, TextAaIcon, WaveformIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { StatCardsSkeleton } from "@/components/common/loading-skeleton"
import { useI18n } from "@/components/providers"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmt } from "@/lib/i18n/config"
import { getUsage } from "@/services/usage"
import type { UsagePeriod, UsageSummary } from "@/types/usage"

import { UsageBarChart } from "@/features/usage/usage-bar-chart"

type Period = Exclude<UsagePeriod, "month">

/** Usage（仕様書 §46）。MVP の簡易表示 */
export function UsageView({ initial }: { initial: UsageSummary }) {
  const { t, f } = useI18n()
  const [cache, setCache] = useState<Partial<Record<Period, UsageSummary>>>({ [initial.period as Period]: initial })
  const [period, setPeriod] = useState<Period>(initial.period as Period)
  const [loading, setLoading] = useState(false)
  const data = cache[period]

  async function select(next: Period) {
    setPeriod(next)
    if (cache[next]) return
    setLoading(true)
    try {
      const res = await getUsage(next)
      setCache((c) => ({ ...c, [next]: res }))
    } catch {
      toast.error(fmt(t.errors.loadFailed, { resource: t.resources.usage }))
    } finally {
      setLoading(false)
    }
  }

  const cards = data
    ? [
        { label: t.usage.characters, value: data.characters, icon: <TextAaIcon /> },
        { label: t.usage.requests, value: data.requests, icon: <WaveformIcon /> },
        { label: t.usage.officialUsage, value: data.officialWorkerCharacters, icon: <SealCheckIcon /> },
        { label: t.usage.privateUsage, value: data.privateWorkerCharacters, icon: <CpuIcon /> },
      ]
    : []

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={period} onValueChange={(v) => select(v as Period)}>
        <TabsList aria-label={t.usage.title}>
          {(["today", "7d", "30d"] as const).map((p) => (
            <TabsTrigger key={p} value={p}>
              {t.usage.periods[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || loading ? (
        <>
          <StatCardsSkeleton />
          <Skeleton className="h-72 w-full" />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label} size="sm">
                <CardHeader>
                  <CardDescription>{c.label}</CardDescription>
                  <CardAction className="text-muted-foreground [&_svg]:size-4">{c.icon}</CardAction>
                </CardHeader>
                <CardContent>
                  <span className="font-heading text-2xl font-semibold tabular-nums">{f.number(c.value)}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.usage.daily}</CardTitle>
              </CardHeader>
              <CardContent>
                <UsageBarChart data={data.daily} />
              </CardContent>
            </Card>

            <Card className="pb-0">
              <CardHeader>
                <CardTitle>{t.usage.byServer}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto border-t px-0">
                <Table className="min-w-[420px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">{t.usage.server}</TableHead>
                      <TableHead className="w-2/5">{t.usage.share}</TableHead>
                      <TableHead className="pr-4 text-right">{t.usage.characters}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byGuild.map((g) => {
                      const share = data.characters ? (g.characters / data.characters) * 100 : 0
                      return (
                        <TableRow key={g.guildId}>
                          <TableCell className="pl-4 font-medium">{g.guildName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 bg-muted">
                                <div className="h-full bg-primary/70" style={{ width: `${share}%` }} />
                              </div>
                              <span className="w-10 text-right text-muted-foreground tabular-nums">
                                {share.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="pr-4 text-right tabular-nums">{f.number(g.characters)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
