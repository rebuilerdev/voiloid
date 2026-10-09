"use client"

import { SealCheckIcon } from "@phosphor-icons/react"

import { StatusBadge, StatusDot } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import type { Worker } from "@/types/worker"

import { congestionTone, summarizeOfficial, type Congestion } from "@/features/workers/utils"

export function useCongestionLabel() {
  const { t } = useI18n()
  return (c: Congestion) =>
    ({ low: t.workers.congestionLow, medium: t.workers.congestionMedium, high: t.workers.congestionHigh })[c]
}

/** 公式Worker は全体の状態のみ表示する（ユーザー決定） */
export function OfficialWorkersSummary({ workers }: { workers: Worker[] }) {
  const { t } = useI18n()
  const label = useCongestionLabel()
  const s = summarizeOfficial(workers)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <SealCheckIcon weight="fill" className="size-4 text-primary" aria-hidden />
          {t.workers.officialWorkers}
        </CardTitle>
        <CardDescription>{t.workers.officialWorkersHint}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">{t.workers.summaryState}</span>
          <StatusBadge tone={s.allUp ? "success" : "warning"}>
            {s.allUp ? t.workers.allOperational : t.workers.partialOutage}
          </StatusBadge>
          <span className="text-muted-foreground tabular-nums">
            {fmt(t.workers.runningCount, { online: s.up, total: s.total })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">{t.workers.congestion}</span>
          <StatusDot tone={congestionTone[s.congestion]} className="font-medium">
            {label(s.congestion)}
          </StatusDot>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">{t.workers.engines}</span>
          <div className="flex flex-wrap gap-1">
            {s.engines.map((e) => (
              <Badge key={e} variant="outline">
                {e}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
