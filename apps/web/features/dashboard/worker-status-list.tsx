"use client"

import { CaretRightIcon, SealCheckIcon } from "@phosphor-icons/react"

import { StatusBadge } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolling } from "@/hooks/use-polling"
import { fmt } from "@/lib/i18n/config"
import { listWorkers } from "@/services/workers"
import type { Worker } from "@/types/worker"

import { privateWorkers, summarizeOfficial } from "@/features/workers/utils"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

/**
 * Worker Status（仕様書 §8）。公式Worker は 1 行に集約（ユーザー決定）、自鯖は個別。
 * 一定間隔で自動更新する（仕様書 §80）。
 */
export function WorkerStatusList({ initial }: { initial: Worker[] }) {
  const { t } = useI18n()
  const [workers] = usePolling(listWorkers, initial)
  const official = summarizeOfficial(workers)
  const mine = privateWorkers(workers)

  const row = "flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>{t.dashboard.workerStatus}</CardTitle>
        <CardDescription>{t.dashboard.workerStatusHint}</CardDescription>
      </CardHeader>
      <CardContent className="border-t px-0">
        <ul className="flex flex-col divide-y">
          {official.total > 0 && (
            <li>
              <GuardedLink href="/workers" className={row}>
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <SealCheckIcon weight="fill" className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{t.common.official}</span>
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {fmt(t.workers.runningCount, { online: official.up, total: official.total })}
                  </span>
                </span>
                <StatusBadge tone={official.allUp ? "success" : "warning"}>
                  {official.allUp ? t.status.online : t.status.degraded}
                </StatusBadge>
              </GuardedLink>
            </li>
          )}
          {mine.map((w) => (
            <li key={w.id}>
              <GuardedLink href={`/workers/${w.id}`} className={row}>
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span className="truncate">{w.name}</span>
                  <CaretRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                </span>
                <WorkerStatusBadge status={w.status} />
              </GuardedLink>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
